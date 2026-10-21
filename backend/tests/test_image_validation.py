# Tests app/services/image_validation.py: magic-byte sniffing (a lying
# Content-Type is still caught because this decodes the real file), the
# decompression-bomb pixel ceiling, animated-image rejection, and that the
# returned bytes are genuinely re-encoded (metadata stripped) rather than
# just the original bytes handed back.

from io import BytesIO

import pytest
from PIL import Image

from app.services.image_validation import InvalidImage, MAX_IMAGE_PIXELS, validate_and_sanitize_image


def _image_bytes(format_="JPEG", size=(20, 20), color=(255, 0, 0), **save_kwargs):
    buffer = BytesIO()
    image = Image.new("RGB" if format_ != "PNG" else "RGBA", size, color)
    image.save(buffer, format=format_, **save_kwargs)
    return buffer.getvalue()


def test_accepts_a_normal_jpeg_and_returns_its_mime_type():
    sanitized, mime_type = validate_and_sanitize_image(_image_bytes("JPEG"))
    assert mime_type == "image/jpeg"
    # Genuinely re-decodable, not just the original bytes echoed back.
    assert Image.open(BytesIO(sanitized)).size == (20, 20)


def test_accepts_a_normal_png_and_a_normal_webp():
    _, png_mime = validate_and_sanitize_image(_image_bytes("PNG"))
    assert png_mime == "image/png"
    _, webp_mime = validate_and_sanitize_image(_image_bytes("WEBP"))
    assert webp_mime == "image/webp"


def test_rejects_garbage_bytes_that_arent_an_image_at_all():
    with pytest.raises(InvalidImage, match="readable photo"):
        validate_and_sanitize_image(b"this is not an image, just some bytes")


def test_rejects_a_file_whose_declared_type_lies_about_what_it_is():
    # A plain text file dressed up with a JPEG Content-Type -- magic-byte
    # sniffing catches this (the caller's declared mime_type is never
    # trusted; it isn't even a parameter here).
    with pytest.raises(InvalidImage):
        validate_and_sanitize_image(b"Content-Type says image/jpeg but this is text")


def test_rejects_an_animated_webp():
    # GIF isn't even in the allowed-format list (rejected for that reason
    # first); WEBP IS allowed, so this is what actually exercises the
    # animation check itself.
    buffer = BytesIO()
    frames = [Image.new("RGB", (10, 10), color) for color in [(255, 0, 0), (0, 255, 0)]]
    frames[0].save(buffer, format="WEBP", save_all=True, append_images=frames[1:])
    with pytest.raises(InvalidImage, match="not an animation"):
        validate_and_sanitize_image(buffer.getvalue())


def test_rejects_an_animated_gif_too_though_for_the_wrong_format_rather_than_being_animated():
    buffer = BytesIO()
    frames = [Image.new("RGB", (10, 10), color) for color in [(255, 0, 0), (0, 255, 0)]]
    frames[0].save(buffer, format="GIF", save_all=True, append_images=frames[1:])
    with pytest.raises(InvalidImage, match="JPEG, PNG or WEBP"):
        validate_and_sanitize_image(buffer.getvalue())


def test_rejects_an_unsupported_but_validly_decoded_format():
    # BMP decodes fine in Pillow but isn't one of the formats this feature
    # (or Gemini) accepts.
    with pytest.raises(InvalidImage, match="JPEG, PNG or WEBP"):
        validate_and_sanitize_image(_image_bytes("BMP"))


def test_rejects_an_image_over_the_decompression_bomb_pixel_ceiling(monkeypatch):
    # Lower the ceiling instead of actually generating a 40-megapixel
    # file, so this test stays fast.
    monkeypatch.setattr("app.services.image_validation.MAX_IMAGE_PIXELS", 100)
    with pytest.raises(InvalidImage, match="too large to process"):
        validate_and_sanitize_image(_image_bytes("PNG", size=(50, 50)))


def test_an_oversized_image_is_refused_before_a_single_pixel_is_decoded(monkeypatch):
    # The whole point of the ceiling is memory: the size check must use the
    # header and run BEFORE image.load(), or the memory is already spent.
    from unittest.mock import patch

    from PIL import PngImagePlugin

    monkeypatch.setattr("app.services.image_validation.MAX_IMAGE_PIXELS", 100)
    with patch.object(PngImagePlugin.PngImageFile, "load", side_effect=AssertionError("decoded before the size check")):
        with pytest.raises(InvalidImage, match="too large to process"):
            validate_and_sanitize_image(_image_bytes("PNG", size=(50, 50)))


def test_the_ceiling_is_40_megapixels_phone_photos_pass_and_48mp_is_refused():
    assert MAX_IMAGE_PIXELS == 40_000_000
    assert 4032 * 3024 < MAX_IMAGE_PIXELS      # 12 MP phone photo
    assert 6000 * 4000 < MAX_IMAGE_PIXELS      # 24 MP camera
    assert 8000 * 6000 > MAX_IMAGE_PIXELS      # 48 MP full-resolution mode


def test_strips_exif_metadata():
    # A JPEG with an EXIF block attached; the sanitized output must not
    # carry it forward (it's re-encoded from decoded pixels, not copied).
    buffer = BytesIO()
    image = Image.new("RGB", (10, 10), (0, 0, 255))
    exif = image.getexif()
    exif[0x0110] = "Suspicious Camera Model"  # Model tag
    image.save(buffer, format="JPEG", exif=exif)

    sanitized, _ = validate_and_sanitize_image(buffer.getvalue())

    assert Image.open(BytesIO(sanitized)).getexif().get(0x0110) is None

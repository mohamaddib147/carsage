# Validates and sanitizes an uploaded photo before it's sent to Gemini (the
# fuel-log camera endpoints, app/routers/fuel_camera.py). Three defenses
# Pillow gives us that a plain declared Content-Type check doesn't:
#
#   1. Magic-byte sniffing: Image.open decodes the actual file header, so a
#      file whose declared Content-Type lies about what it is is caught
#      here instead of being forwarded to Gemini as that type.
#   2. A decompression-bomb ceiling: MAX_IMAGE_PIXELS rejects an image
#      whose decoded dimensions would be an unreasonable amount of memory.
#      The size comes from the file header and is checked BEFORE any pixel
#      is decoded; decoding first would already have used the memory.
#   3. Re-encoding: the returned bytes are freshly re-encoded from the
#      decoded pixels, which drops EXIF (including GPS location) and any
#      other embedded metadata before the photo ever leaves this process.
#      The photo is read for this one request and never stored, so this
#      IS the one and only "strip metadata" step for what reaches Gemini.
#
# An animated/multi-frame image is rejected outright: nothing about a pump
# or odometer photo should ever be animated, and decoding every frame is
# both wasted work and another amplification vector.

from io import BytesIO

from PIL import Image

# 40 million pixels decode to about 120 MB as RGB, which fits a 512 MB host.
# Above any 12-24 MP photo, so those pass; a full-resolution 48-50 MP JPEG is
# refused with a "use a smaller photo" message.
MAX_IMAGE_PIXELS = 40_000_000

_ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
_MIME_BY_FORMAT = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


class InvalidImage(Exception):
    """Raised when a file isn't a readable, safe still image. Its message
    is safe to show to the end user."""


def validate_and_sanitize_image(image_bytes: bytes) -> tuple[bytes, str]:
    """
    Decodes `image_bytes`, rejects anything unsafe or not a real still
    image, and returns freshly re-encoded bytes (metadata stripped) plus
    the mime type Gemini should be told.

    Raises:
        InvalidImage: not a readable image, an animated/multi-frame file,
            an unsupported format, or decoding it would exceed
            MAX_IMAGE_PIXELS.
    """
    try:
        probe = Image.open(BytesIO(image_bytes))
        probe.verify()
        # verify() closes the file object -- a fresh Image.open is needed
        # to actually read pixel data afterwards.
        image = Image.open(BytesIO(image_bytes))
        image_format = image.format
        frame_count = getattr(image, "n_frames", 1)
        width, height = image.size
    except Exception as error:
        raise InvalidImage("That doesn't look like a readable photo. Please try again.") from error

    # Everything up to here came from the header; check it before decoding pixels.
    if image_format not in _ALLOWED_FORMATS:
        raise InvalidImage("Please upload a JPEG, PNG or WEBP photo.")
    if frame_count > 1:
        raise InvalidImage("Please upload a single still photo, not an animation.")
    if width * height > MAX_IMAGE_PIXELS:
        raise InvalidImage("That image is too large to process. Please use a smaller photo.")

    try:
        image.load()
    except Exception as error:
        raise InvalidImage("That doesn't look like a readable photo. Please try again.") from error

    save_format = image_format
    if save_format == "JPEG":
        image = image.convert("RGB")
    elif image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.mode else "RGB")

    output = BytesIO()
    image.save(output, format=save_format)
    return output.getvalue(), _MIME_BY_FORMAT[save_format]

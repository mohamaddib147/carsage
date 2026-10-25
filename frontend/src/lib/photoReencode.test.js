// Tests lib/photoReencode.js: the pre-check (any image, not empty, under 25 MB), the
// 1600 px fit, and browser re-encoding to a JPEG under 2 MB (quality steps down,
// then the size; an undecodable file is reported). Shared by every photo the app
// sends or stores.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fitWithin,
  getPhotoFileError,
  MAX_UPLOAD_BYTES,
  PHOTO_FILE_ERRORS,
  reencodeToJpeg,
} from "./photoReencode.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("getPhotoFileError", () => {
  it("accepts any image type and refuses non-images, empty and huge files", () => {
    expect(getPhotoFileError({ type: "image/heic", size: 3_000_000 })).toBe("");
    expect(getPhotoFileError({ type: "application/pdf", size: 1000 })).toBe(PHOTO_FILE_ERRORS.notImage);
    expect(getPhotoFileError({ type: "image/jpeg", size: 0 })).toBe(PHOTO_FILE_ERRORS.unreadable);
    expect(getPhotoFileError({ type: "image/jpeg", size: 25 * 1024 * 1024 + 1 })).toBe(PHOTO_FILE_ERRORS.tooBig);
  });
});

describe("fitWithin", () => {
  it("scales the longest side down to 1600 px and never scales up", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("reencodeToJpeg", () => {
  function stubCanvas(sizesByCall) {
    const drawImage = vi.fn();
    const qualities = [];
    let call = 0;
    const canvases = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag !== "canvas") return realCreate(tag);
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (resolve, type, quality) => {
          qualities.push(quality);
          resolve(new Blob([new Uint8Array(sizesByCall[call++] ?? 10)], { type }));
        },
      };
      canvases.push(canvas);
      return canvas;
    });
    return { drawImage, qualities, canvases };
  }

  it("draws at most 1600 px and returns the first JPEG under 2 MB", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4000, height: 3000, close }));
    const { qualities, canvases } = stubCanvas([MAX_UPLOAD_BYTES + 1, 1_500_000]);

    const blob = await reencodeToJpeg(new Blob(["x"], { type: "image/heic" }));

    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBe(1_500_000);
    expect(canvases[0]).toMatchObject({ width: 1600, height: 1200 });
    expect(qualities).toEqual([0.85, 0.75]);
    expect(close).toHaveBeenCalled();
  });

  it("drops to 1200 px when no quality fits at 1600 px", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }));
    const tooBig = MAX_UPLOAD_BYTES + 1;
    const { canvases } = stubCanvas([tooBig, tooBig, tooBig, tooBig, 900_000]);

    const blob = await reencodeToJpeg(new Blob(["x"]));

    expect(blob.size).toBe(900_000);
    expect(canvases[1]).toMatchObject({ width: 1200, height: 900 });
  });

  it("reports an unreadable photo when the browser can't decode it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode")));
    await expect(reencodeToJpeg(new Blob(["x"]))).rejects.toThrow(PHOTO_FILE_ERRORS.unreadable);
  });
});

// Tests for CAR-58's car photo helpers: client-side validation boundaries
// (mirrors limits.test.js's getRegistrationImageError shape), and
// upload/read/delete against a mocked supabase.storage.from(...) chain so
// no real network/Storage calls happen.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALLOWED_CAR_PHOTO_TYPES,
  MAX_CAR_PHOTO_BYTES,
  deleteCarPhoto,
  getCarPhotoError,
  getCarPhotoUrl,
  uploadCarPhoto,
} from "./carPhoto.js";
import { supabase } from "./supabaseClient.js";

vi.mock("./supabaseClient.js", () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // A stable, real-looking UUID so uploadCarPhoto's test can assert on the exact path.
  vi.stubGlobal("crypto", { randomUUID: () => "11111111-2222-3333-4444-555555555555" });
});

describe("getCarPhotoError (CAR-58)", () => {
  it("accepts a normal-sized JPEG (normal case)", () => {
    expect(getCarPhotoError({ type: "image/jpeg", size: 2_000_000 })).toBe("");
  });

  it.each([...ALLOWED_CAR_PHOTO_TYPES])("accepts every allowed type (%s)", (type) => {
    expect(getCarPhotoError({ type, size: 1024 })).toBe("");
  });

  it.each(["text/plain", "application/pdf", "video/mp4", ""])(
    "rejects a non-image type (%s)",
    (type) => {
      expect(getCarPhotoError({ type, size: 1024 })).toBe(
        "Please choose a JPEG, PNG, WEBP or HEIC photo.",
      );
    },
  );

  it("rejects a file over the 8 MB cap", () => {
    expect(getCarPhotoError({ type: "image/jpeg", size: MAX_CAR_PHOTO_BYTES + 1 })).toBe(
      "That image is too large. Please use a photo under 8 MB.",
    );
  });

  it("accepts a file right at the 8 MB boundary", () => {
    expect(getCarPhotoError({ type: "image/jpeg", size: MAX_CAR_PHOTO_BYTES })).toBe("");
  });

  it("rejects an empty file (edge case)", () => {
    expect(getCarPhotoError({ type: "image/jpeg", size: 0 })).toBe(
      "That image appears to be empty. Please try again.",
    );
  });
});

describe("uploadCarPhoto (CAR-58)", () => {
  it("uploads to the caller's own folder, never overwriting an existing object (normal case)", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    supabase.storage.from.mockReturnValue({ upload });

    const file = { type: "image/jpeg" };
    const result = await uploadCarPhoto("user-123", "car-abc", file);

    expect(supabase.storage.from).toHaveBeenCalledWith("car-photos");
    expect(upload).toHaveBeenCalledWith(
      "user-123/car-abc-11111111-2222-3333-4444-555555555555.jpg",
      file,
      { contentType: "image/jpeg", upsert: false },
    );
    expect(result).toEqual({
      path: "user-123/car-abc-11111111-2222-3333-4444-555555555555.jpg",
      error: null,
    });
  });

  it("returns a null path and the error on failure (edge case)", async () => {
    const uploadError = new Error("Storage is unavailable");
    supabase.storage.from.mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: uploadError }) });

    const result = await uploadCarPhoto("user-123", "car-abc", { type: "image/jpeg" });

    expect(result).toEqual({ path: null, error: uploadError });
  });

  it.each(Object.entries({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" }))(
    "picks the right file extension for %s",
    async (type, extension) => {
      const upload = vi.fn().mockResolvedValue({ error: null });
      supabase.storage.from.mockReturnValue({ upload });

      await uploadCarPhoto("user-123", "car-abc", { type });

      expect(upload.mock.calls[0][0].endsWith(`.${extension}`)).toBe(true);
    },
  );
});

describe("getCarPhotoUrl (CAR-58)", () => {
  it("returns null for a null/empty path, without calling Supabase (edge case)", async () => {
    expect(await getCarPhotoUrl(null)).toBeNull();
    expect(await getCarPhotoUrl("")).toBeNull();
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("returns a signed URL for a real path (normal case)", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://example.supabase.co/signed/car.jpg?token=abc" },
      error: null,
    });
    supabase.storage.from.mockReturnValue({ createSignedUrl });

    const url = await getCarPhotoUrl("user-123/car-abc-uuid.jpg");

    expect(createSignedUrl).toHaveBeenCalledWith("user-123/car-abc-uuid.jpg", 3600);
    expect(url).toBe("https://example.supabase.co/signed/car.jpg?token=abc");
  });

  it("returns null (not a broken link) when the signed URL can't be created, e.g. the object was already deleted", async () => {
    supabase.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: new Error("Object not found") }),
    });

    expect(await getCarPhotoUrl("user-123/gone.jpg")).toBeNull();
  });
});

describe("deleteCarPhoto (CAR-58)", () => {
  it("removes the object at the given path (normal case)", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    supabase.storage.from.mockReturnValue({ remove });

    await deleteCarPhoto("user-123/car-abc-uuid.jpg");

    expect(supabase.storage.from).toHaveBeenCalledWith("car-photos");
    expect(remove).toHaveBeenCalledWith(["user-123/car-abc-uuid.jpg"]);
  });

  it("does nothing for a null/empty path, without calling Supabase (edge case)", async () => {
    await deleteCarPhoto(null);
    await deleteCarPhoto("");

    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("never throws when the delete itself fails (best-effort)", async () => {
    supabase.storage.from.mockReturnValue({
      remove: vi.fn().mockResolvedValue({ error: new Error("Network error") }),
    });

    await expect(deleteCarPhoto("user-123/car-abc-uuid.jpg")).resolves.toBeUndefined();
  });
});

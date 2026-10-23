// Tests lib/scanPhoto.js: the photo is re-encoded in the browser BEFORE it is sent,
// and what is sent is the re-encoded JPEG (never the original file), as a multipart
// upload with the access token; an undecodable photo never reaches the network.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./apiClient.js";
import { scanPhoto } from "./scanPhoto.js";

vi.mock("./apiClient.js", () => ({ apiFetch: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("scanPhoto", () => {
  it("sends the re-encoded JPEG, not the original, as multipart with the token, and returns the reply", async () => {
    const original = new File([new Uint8Array(5000)], "IMG_1.heic", { type: "image/heic" });
    const jpeg = new Blob([new Uint8Array(100)], { type: "image/jpeg" });
    const encode = vi.fn().mockResolvedValue(jpeg);
    apiFetch.mockResolvedValue({ readable: true, odometer_km: 84610 });

    const result = await scanPhoto("/fuel-log/scan-odometer", original, "tok-1", { encode });

    expect(result).toEqual({ readable: true, odometer_km: 84610 });
    expect(encode).toHaveBeenCalledWith(original);
    const [path, options] = apiFetch.mock.calls[0];
    expect(path).toBe("/fuel-log/scan-odometer");
    expect(options).toMatchObject({ method: "POST", accessToken: "tok-1" });
    const sent = options.body.get("file");
    expect(sent.name).toBe("photo.jpg");
    expect(sent.type).toBe("image/jpeg");
    expect(sent.size).toBe(100);
  });

  it("never calls the network when the photo can't be decoded", async () => {
    const encode = vi.fn().mockRejectedValue(new Error("Couldn't read that photo. Please try another one."));

    await expect(scanPhoto("/fuel-log/scan-pump", new File(["x"], "a.jpg", { type: "image/jpeg" }), "t", { encode })).rejects.toThrow(
      "Couldn't read that photo.",
    );
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

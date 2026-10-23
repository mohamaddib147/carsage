// Tests lib/recordPhotos.js (Step 3): the one path the database accepts, row first then file (and the row deleted again if the
// upload fails), the 100-photo cap message, 5-minute signed URLs (null for a
// missing file), and delete order. Plus the stored-only guard: this module and the
// photo component never import the API client or call fetch, so no photo can be
// sent to the backend, Gemini or anything else.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addPhoto,
  deletePhoto,
  firstFreeSlot,
  getPhotoUrl,
  PHOTO_ERRORS,
  photoPath,
  SIGNED_URL_TTL_SECONDS,
} from "./recordPhotos.js";
import { supabase } from "./supabaseClient.js";

vi.mock("./supabaseClient.js", () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

const USER = "11111111-1111-4111-8111-111111111111";
const RECORD = "22222222-2222-4222-8222-222222222222";
const PHOTO_ID = "33333333-3333-4333-8333-333333333333";

function mockTables({ insertError = null, deleteError = null } = {}) {
  const deleteEq = vi.fn().mockResolvedValue({ error: deleteError });
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  const del = vi.fn(() => ({ eq: deleteEq }));
  supabase.from.mockReturnValue({ insert, delete: del });
  return { insert, del, deleteEq };
}

function mockStorage({ uploadError = null, signed = "https://signed.example/p.jpg" } = {}) {
  const upload = vi.fn().mockResolvedValue({ error: uploadError });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const createSignedUrl = vi.fn().mockResolvedValue(
    signed ? { data: { signedUrl: signed }, error: null } : { data: null, error: { message: "Object not found" } },
  );
  supabase.storage.from.mockReturnValue({ upload, remove, createSignedUrl });
  return { upload, remove, createSignedUrl };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(crypto, "randomUUID").mockReturnValue(PHOTO_ID);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("photoPath", () => {
  it("builds the exact path the database accepts", () => {
    expect(photoPath("maintenance", USER, RECORD, PHOTO_ID)).toBe(`${USER}/maintenance/${RECORD}/${PHOTO_ID}.jpg`);
    expect(photoPath("receipt", USER, RECORD, PHOTO_ID)).toBe(`${USER}/receipts/${RECORD}/${PHOTO_ID}.jpg`);
  });
});

describe("firstFreeSlot", () => {
  it("picks the lowest free slot, or null at 3", () => {
    expect(firstFreeSlot([])).toBe(1);
    expect(firstFreeSlot([{ slot: 1 }, { slot: 3 }])).toBe(2);
    expect(firstFreeSlot([{ slot: 1 }, { slot: 2 }, { slot: 3 }])).toBeNull();
  });
});

describe("addPhoto", () => {
  const encode = vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" }));

  it("re-encodes, inserts the row, THEN uploads the JPEG to the same path (no overwrite)", async () => {
    const { insert } = mockTables();
    const { upload } = mockStorage();

    const added = await addPhoto("maintenance", { userId: USER, parentId: RECORD, slot: 2, file: new Blob(["raw"]), encode });

    const path = `${USER}/maintenance/${RECORD}/${PHOTO_ID}.jpg`;
    expect(supabase.from).toHaveBeenCalledWith("maintenance_record_photos");
    expect(insert).toHaveBeenCalledWith({ id: PHOTO_ID, user_id: USER, record_id: RECORD, storage_path: path, slot: 2 });
    expect(upload).toHaveBeenCalledWith(path, expect.any(Blob), { contentType: "image/jpeg", upsert: false });
    expect(insert.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]);
    expect(added).toEqual({ id: PHOTO_ID, storage_path: path, slot: 2 });
  });

  it("writes a receipt row without a slot", async () => {
    const { insert } = mockTables();
    mockStorage();

    await addPhoto("receipt", { userId: USER, parentId: RECORD, file: new Blob(["raw"]), encode });

    expect(supabase.from).toHaveBeenCalledWith("car_expense_receipts");
    expect(insert).toHaveBeenCalledWith({ id: PHOTO_ID, user_id: USER, expense_id: RECORD, storage_path: `${USER}/receipts/${RECORD}/${PHOTO_ID}.jpg` });
  });

  it("deletes the row again when the upload fails", async () => {
    const { deleteEq } = mockTables();
    mockStorage({ uploadError: { message: "network" } });

    await expect(addPhoto("maintenance", { userId: USER, parentId: RECORD, slot: 1, file: new Blob(["raw"]), encode })).rejects.toThrow(PHOTO_ERRORS.failed);
    expect(deleteEq).toHaveBeenCalledWith("id", PHOTO_ID);
  });

  it("never uploads when the row insert is refused, and names the 100-photo cap", async () => {
    mockTables({ insertError: { code: "42501", message: "new row violates row-level security policy" } });
    const { upload } = mockStorage();

    await expect(addPhoto("maintenance", { userId: USER, parentId: RECORD, slot: 1, file: new Blob(["raw"]), encode })).rejects.toThrow(PHOTO_ERRORS.limit);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("getPhotoUrl", () => {
  it("asks for a signed URL that expires in 5 minutes", async () => {
    const { createSignedUrl } = mockStorage();
    expect(await getPhotoUrl("a/b.jpg")).toBe("https://signed.example/p.jpg");
    expect(createSignedUrl).toHaveBeenCalledWith("a/b.jpg", 300);
    expect(SIGNED_URL_TTL_SECONDS).toBe(300);
  });

  it("is null for a missing file (shown as a placeholder)", async () => {
    mockStorage({ signed: null });
    expect(await getPhotoUrl("a/b.jpg")).toBeNull();
  });
});

describe("deletePhoto", () => {
  it("deletes the row, then the file", async () => {
    const { deleteEq } = mockTables();
    const { remove } = mockStorage();

    await deletePhoto("receipt", { id: PHOTO_ID, storage_path: "p.jpg" });

    expect(supabase.from).toHaveBeenCalledWith("car_expense_receipts");
    expect(deleteEq).toHaveBeenCalledWith("id", PHOTO_ID);
    expect(remove).toHaveBeenCalledWith(["p.jpg"]);
    expect(deleteEq.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  });

  it("keeps the file when the row delete fails", async () => {
    mockTables({ deleteError: { code: "42501" } });
    const { remove } = mockStorage();

    await expect(deletePhoto("receipt", { id: PHOTO_ID, storage_path: "p.jpg" })).rejects.toEqual({ code: "42501" });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("stored only (source-scan guard)", () => {
  const sources = import.meta.glob(["/src/lib/recordPhotos.js", "/src/components/RecordPhotos.jsx", "/src/components/PendingPhotos.jsx"], {
    query: "?raw",
    import: "default",
    eager: true,
  });

  it("scanned every photo file", () => {
    expect(Object.keys(sources).sort()).toEqual([
      "/src/components/PendingPhotos.jsx",
      "/src/components/RecordPhotos.jsx",
      "/src/lib/recordPhotos.js",
    ]);
  });

  it.each(Object.keys(sources))("%s never imports the API client or calls fetch", (path) => {
    const code = sources[path].replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/apiClient|apiFetch|\bfetch\(|XMLHttpRequest|sendBeacon/);
  });

  it("no other frontend file touches the record-photos bucket or the photo tables", () => {
    const all = import.meta.glob("/src/**/*.{js,jsx}", { query: "?raw", import: "default", eager: true });
    const touching = Object.entries(all)
      .filter(([path]) => !/\.test\.jsx?$/.test(path))
      .filter(([, text]) => /record-photos|maintenance_record_photos|car_expense_receipts/.test(text))
      .map(([path]) => path);
    expect(touching).toEqual(["/src/lib/recordPhotos.js"]);
  });
});

// Tests components/RecordPhotos.jsx (Step 3): nothing is fetched or shown until the
// user opens it; photos render as <img> from signed URLs; a missing file shows a
// "Photo missing" placeholder; adding uses the first free slot and hides the add
// control at the limit (3 photos, 1 receipt); the 100-photo cap and other errors
// show plain text; remove takes the photo away. lib/recordPhotos.js is mocked.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecordPhotos from "./RecordPhotos.jsx";
import { addPhoto, deletePhoto, getPhotoUrl, listPhotos, PHOTO_ERRORS } from "../lib/recordPhotos.js";

vi.mock("../lib/recordPhotos.js", async (importOriginal) => ({
  ...(await importOriginal()),
  listPhotos: vi.fn(),
  getPhotoUrl: vi.fn(),
  addPhoto: vi.fn(),
  deletePhoto: vi.fn(),
}));

const LABEL = "the Oil change completion on 1 Oct 2026";

function renderPhotos(kind = "maintenance") {
  return render(<RecordPhotos kind={kind} parentId="rec-1" userId="user-1" label={LABEL} />);
}

function photoFile() {
  return new File([new Uint8Array(10)], "p.jpg", { type: "image/jpeg" });
}

beforeEach(() => {
  vi.clearAllMocks();
  getPhotoUrl.mockImplementation(async (path) => `https://signed.example/${path}`);
});

describe("RecordPhotos", () => {
  it("fetches nothing and shows no image until opened", async () => {
    const user = userEvent.setup();
    listPhotos.mockResolvedValue([{ id: "p1", storage_path: "a.jpg", slot: 1 }]);
    renderPhotos();

    expect(listPhotos).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `Show photos for ${LABEL}` }));

    const img = await screen.findByRole("img", { name: `Photo 1 for ${LABEL}` });
    expect(img).toHaveAttribute("src", "https://signed.example/a.jpg");
    expect(listPhotos).toHaveBeenCalledWith("maintenance", "rec-1");
  });

  it("shows a 'Photo missing' placeholder when the file is gone (no signed URL) or fails to load", async () => {
    const user = userEvent.setup();
    listPhotos.mockResolvedValue([{ id: "p1", storage_path: "gone.jpg", slot: 1 }]);
    getPhotoUrl.mockResolvedValue(null);
    renderPhotos();

    await user.click(screen.getByRole("button", { name: `Show photos for ${LABEL}` }));
    expect(await screen.findByRole("img", { name: "Photo missing" })).toBeInTheDocument();
  });

  it("adds a photo into the first free slot", async () => {
    const user = userEvent.setup();
    listPhotos.mockResolvedValue([{ id: "p1", storage_path: "a.jpg", slot: 1 }]);
    addPhoto.mockResolvedValue({ id: "p2", storage_path: "b.jpg", slot: 2 });
    renderPhotos();

    await user.click(screen.getByRole("button", { name: `Show photos for ${LABEL}` }));
    await user.upload(await screen.findByLabelText(`Add a photo for ${LABEL}`), photoFile());

    expect(addPhoto).toHaveBeenCalledWith("maintenance", expect.objectContaining({ userId: "user-1", parentId: "rec-1", slot: 2 }));
    expect(await screen.findByRole("img", { name: `Photo 2 for ${LABEL}` })).toBeInTheDocument();
  });

  it("hides the add control at 3 photos", async () => {
    const user = userEvent.setup();
    listPhotos.mockResolvedValue([1, 2, 3].map((slot) => ({ id: `p${slot}`, storage_path: `${slot}.jpg`, slot })));
    renderPhotos();

    await user.click(screen.getByRole("button", { name: `Show photos for ${LABEL}` }));
    await screen.findByRole("img", { name: `Photo 3 for ${LABEL}` });
    expect(screen.queryByLabelText(`Add a photo for ${LABEL}`)).not.toBeInTheDocument();
  });

  it("allows one receipt only", async () => {
    const user = userEvent.setup();
    listPhotos.mockResolvedValue([{ id: "r1", storage_path: "r.jpg" }]);
    renderPhotos("receipt");

    await user.click(screen.getByRole("button", { name: `Show receipt for ${LABEL}` }));
    expect(await screen.findByRole("img", { name: `Receipt for ${LABEL}` })).toBeInTheDocument();
    expect(screen.queryByLabelText(`Attach a receipt for ${LABEL}`)).not.toBeInTheDocument();
  });

  it("shows the 100-photo cap in plain words", async () => {
    const user = userEvent.setup();
    listPhotos.mockResolvedValue([]);
    addPhoto.mockRejectedValue(new Error(PHOTO_ERRORS.limit));
    renderPhotos();

    await user.click(screen.getByRole("button", { name: `Show photos for ${LABEL}` }));
    await user.upload(await screen.findByLabelText(`Add a photo for ${LABEL}`), photoFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(PHOTO_ERRORS.limit);
  });

  it("never shows raw error text from an unexpected failure", async () => {
    const user = userEvent.setup();
    listPhotos.mockResolvedValue([]);
    addPhoto.mockRejectedValue(new Error("duplicate key value violates unique constraint"));
    renderPhotos();

    await user.click(screen.getByRole("button", { name: `Show photos for ${LABEL}` }));
    await user.upload(await screen.findByLabelText(`Add a photo for ${LABEL}`), photoFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(PHOTO_ERRORS.failed);
  });

  it("refuses a non-image file without trying to save it", async () => {
    const user = userEvent.setup({ applyAccept: false });
    listPhotos.mockResolvedValue([]);
    renderPhotos();

    await user.click(screen.getByRole("button", { name: `Show photos for ${LABEL}` }));
    await user.upload(await screen.findByLabelText(`Add a photo for ${LABEL}`), new File(["x"], "a.pdf", { type: "application/pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(PHOTO_ERRORS.notImage);
    expect(addPhoto).not.toHaveBeenCalled();
  });

  it("removes a photo", async () => {
    const user = userEvent.setup();
    const photo = { id: "p1", storage_path: "a.jpg", slot: 1 };
    listPhotos.mockResolvedValue([photo]);
    deletePhoto.mockResolvedValue();
    renderPhotos();

    await user.click(screen.getByRole("button", { name: `Show photos for ${LABEL}` }));
    await user.click(await screen.findByRole("button", { name: `Remove photo 1 for ${LABEL}` }));

    expect(deletePhoto).toHaveBeenCalledWith("maintenance", photo);
    await waitFor(() => expect(screen.queryByRole("img", { name: `Photo 1 for ${LABEL}` })).not.toBeInTheDocument());
  });
});

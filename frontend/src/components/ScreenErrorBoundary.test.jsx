// Tests the error boundary around the lazy screens (CAR-67 follow-up): a failed
// download and a crashing screen each show a clear message and a Reload button,
// the Reload button reloads, and the error clears when the path changes.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isChunkLoadError } from "../lib/chunkReload.js";
import { lazyScreen } from "../lib/screenLoading.js";
import ScreenErrorBoundary from "./ScreenErrorBoundary.jsx";

beforeEach(() => {
  // React and the boundary both log a caught error; keep the test output clean.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function Boom({ message }) {
  throw new Error(message);
}

describe("isChunkLoadError", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://carsage.netlify.app/assets/FuelLogPage-abc.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/index-abc.css",
  ])("recognizes the browser's message: %s", (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it("does not mistake an ordinary crash for a failed download (invalid input cases)", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("ScreenErrorBoundary", () => {
  it("renders its children when nothing is wrong", () => {
    render(
      <ScreenErrorBoundary resetKey="/">
        <p>all good</p>
      </ScreenErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a failed screen download (simulated failing dynamic import) shows the update/connection message and a Reload button", async () => {
    const Broken = lazyScreen(() =>
      Promise.reject(new Error("Failed to fetch dynamically imported module: /assets/FuelLogPage-abc.js")),
    );
    render(
      <ScreenErrorBoundary resetKey="/fuel-log">
        <Suspense fallback={<p>loading</p>}>
          <Broken />
        </Suspense>
      </ScreenErrorBoundary>,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This page could not load");
    expect(alert).toHaveTextContent("updated");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.queryByText("loading")).not.toBeInTheDocument();
  });

  it("a screen that crashes while rendering shows a different, honest message and a Reload button", () => {
    render(
      <ScreenErrorBoundary resetKey="/">
        <Boom message="Cannot read properties of undefined" />
      </ScreenErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("alert")).not.toHaveTextContent("updated");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("Reload button reloads the page", async () => {
    const onReload = vi.fn();
    render(
      <ScreenErrorBoundary resetKey="/" onReload={onReload}>
        <Boom message="Failed to fetch dynamically imported module" />
      </ScreenErrorBoundary>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("keeps the error in the console for debugging", () => {
    render(
      <ScreenErrorBoundary resetKey="/">
        <Boom message="Failed to fetch dynamically imported module" />
      </ScreenErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith("Screen failed to load:", expect.any(Error));
  });

  it("clears the error when the path changes, so another screen can open without a reload", () => {
    const { rerender } = render(
      <ScreenErrorBoundary resetKey="/fuel-log">
        <Boom message="Failed to fetch dynamically imported module" />
      </ScreenErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ScreenErrorBoundary resetKey="/dashboard">
        <p>the dashboard</p>
      </ScreenErrorBoundary>,
    );
    expect(screen.getByText("the dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("stays on the error if the path has not changed", () => {
    const { rerender } = render(
      <ScreenErrorBoundary resetKey="/fuel-log">
        <Boom message="Failed to fetch dynamically imported module" />
      </ScreenErrorBoundary>,
    );
    rerender(
      <ScreenErrorBoundary resetKey="/fuel-log">
        <p>should not show</p>
      </ScreenErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("should not show")).not.toBeInTheDocument();
  });
});

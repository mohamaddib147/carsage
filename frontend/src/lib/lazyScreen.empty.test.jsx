// Tests lazyScreen's handling of an empty import (CAR-67 follow-up). When
// chunkReload.js swallows a failed download (preventDefault on
// `vite:preloadError`), Vite resolves the import with undefined and a page
// reload is already on its way. The screen must stay on its loading fallback
// instead of throwing, so no error message flashes before the reload.
//
// Its own file because the intentionally never-finishing download stays counted
// in screenLoading.js's module-level counter, which other tests assert on.

import { act, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it } from "vitest";
import ScreenErrorBoundary from "../components/ScreenErrorBoundary.jsx";
import { lazyScreen } from "./screenLoading.js";

describe("lazyScreen with an empty import", () => {
  it("stays on the fallback, without reaching the error boundary", async () => {
    const Screen = lazyScreen(() => Promise.resolve(undefined));
    render(
      <ScreenErrorBoundary resetKey="/">
        <Suspense fallback={<p>fallback</p>}>
          <Screen />
        </Suspense>
      </ScreenErrorBoundary>,
    );
    await act(async () => {});
    expect(screen.getByText("fallback")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

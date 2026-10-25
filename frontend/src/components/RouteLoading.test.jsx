// Tests the lazy-route fallback (CAR-67): it announces loading to assistive
// tech, shows a page-shaped skeleton (never a blank screen), and hides the
// decorative bars from screen readers.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RouteLoading from "./RouteLoading.jsx";

describe("RouteLoading", () => {
  it("announces that the screen is loading", () => {
    render(<RouteLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });

  it("shows a page-shaped skeleton: a title bar and a content card", () => {
    const { container } = render(<RouteLoading />);
    expect(container.querySelectorAll(".skeleton-bar").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector(".skeleton-bar--card")).toBeInTheDocument();
  });

  it("keeps the decorative bars away from assistive tech (edge case: no duplicate announcement)", () => {
    const { container } = render(<RouteLoading />);
    expect(container.querySelector(".skeleton-stack")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

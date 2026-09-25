// Tests for the small brand-identifying badge (CAR-55; CAR-55 follow-up,
// mentor feedback, no Jira task): shows the real logo mark for a make
// simple-icons carries (carBrandIcons.js), falls back to a colored
// initial for a mapped make it doesn't carry (Mercedes-Benz) or renders
// nothing for an unmapped/missing make (never implying a false or
// missing match), and the logo is always drawn from the bundled SVG path
// data — never an <img> pointing at a separate asset file.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BrandBadge from "./BrandBadge.jsx";

describe("BrandBadge — real logo marks", () => {
  it("shows the real logo mark for a make simple-icons carries (normal case)", () => {
    render(<BrandBadge make="Ferrari" />);

    const badge = screen.getByLabelText("Ferrari brand badge");
    expect(badge.tagName).toBe("svg");
    expect(badge.querySelector("path")).toHaveAttribute("fill", "#D40000");
  });

  it("sizes the logo from the size prop", () => {
    render(<BrandBadge make="BMW" size={40} />);

    const badge = screen.getByLabelText("BMW brand badge");
    expect(badge).toHaveAttribute("width", "40");
    expect(badge).toHaveAttribute("height", "40");
  });

  it("never renders an <img> — the logo is drawn from bundled SVG path data, not a separate asset file", () => {
    const { container } = render(<BrandBadge make="Toyota" />);
    // The SVG itself carries role="img" for accessibility (an <img>-role
    // element is expected here) — what must never appear is an actual
    // <img> tag pointing at a separate logo asset file.
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("BrandBadge — fallback for a mapped make without a logo mark", () => {
  it("shows the brand's first letter on its theme color for Mercedes-Benz (simple-icons has no Mercedes-Benz mark)", () => {
    render(<BrandBadge make="Mercedes-Benz" />);

    const badge = screen.getByLabelText("Mercedes-Benz brand badge");
    expect(badge.tagName).not.toBe("svg");
    expect(badge).toHaveTextContent("M");
    expect(badge).toHaveStyle({ backgroundColor: "#1b1b1b" });
  });
});

describe("BrandBadge — unrecognized or missing make", () => {
  it("renders nothing for an unrecognized make (edge case)", () => {
    const { container } = render(<BrandBadge make="Yugo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a missing make (edge case)", () => {
    const { container } = render(<BrandBadge make={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

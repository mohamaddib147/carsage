// Tests for the small brand-identifying badge (CAR-55; CAR-55 follow-up,
// mentor feedback, no Jira task): shows a user-supplied raster logo for
// Mercedes-Benz, the real SVG logo mark for a make simple-icons carries
// (carBrandIcons.js), falls back to a colored initial for a mapped make
// with neither, or renders nothing for an unmapped/missing make (never
// implying a false or missing match). Also tests hasBrandBadge(), the
// helper a caller uses to know whether BrandBadge will render anything.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BrandBadge, { hasBrandBadge } from "./BrandBadge.jsx";

describe("BrandBadge — user-supplied raster logo (Mercedes-Benz)", () => {
  it("shows the Mercedes-Benz logo image (normal case)", () => {
    render(<BrandBadge make="Mercedes-Benz" />);

    const badge = screen.getByLabelText("Mercedes-Benz brand badge");
    expect(badge.tagName).toBe("IMG");
    expect(badge).toHaveAttribute("src");
    expect(badge.getAttribute("src")).toMatch(/Mercedes-Benz-Logo/);
  });

  it("sizes the logo from the size prop", () => {
    render(<BrandBadge make="Mercedes-Benz" size={40} />);

    const badge = screen.getByLabelText("Mercedes-Benz brand badge");
    expect(badge).toHaveAttribute("width", "40");
    expect(badge).toHaveAttribute("height", "40");
  });
});

describe("BrandBadge — real SVG logo marks (simple-icons)", () => {
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

describe("hasBrandBadge", () => {
  it("is true for a make with a raster logo, an SVG logo, or neither but a mapped theme", () => {
    expect(hasBrandBadge("Mercedes-Benz")).toBe(true);
    expect(hasBrandBadge("Ferrari")).toBe(true);
  });

  it("is false for an unrecognized or missing make", () => {
    expect(hasBrandBadge("Yugo")).toBe(false);
    expect(hasBrandBadge(null)).toBe(false);
    expect(hasBrandBadge("")).toBe(false);
  });
});

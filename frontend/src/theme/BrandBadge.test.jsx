// Tests for the small brand-identifying badge (CAR-55): shows a colored
// initial for a recognized make, renders nothing for an unmapped or
// missing make (never implying a false brand match), and never renders
// any manufacturer logo image/asset — just a styled letter.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BrandBadge from "./BrandBadge.jsx";

describe("BrandBadge", () => {
  it("shows the brand's first letter on its theme color for a recognized make (normal case)", () => {
    render(<BrandBadge make="Ferrari" />);

    const badge = screen.getByLabelText("Ferrari brand badge");
    expect(badge).toHaveTextContent("F");
    expect(badge).toHaveStyle({ backgroundColor: "#d40000" });
  });

  it("renders nothing for an unrecognized make (edge case)", () => {
    const { container } = render(<BrandBadge make="Yugo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a missing make (edge case)", () => {
    const { container } = render(<BrandBadge make={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("never renders an <img> — no manufacturer logo artwork, just a styled letter", () => {
    render(<BrandBadge make="BMW" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

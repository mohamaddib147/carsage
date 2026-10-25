// Tests for the CarSage brand mark (CAR-51): renders the finalized logo
// asset as an image, sized by height via the `size` prop, with the aspect
// ratio left to the browser (width: auto) rather than stretched.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Logo from "./Logo.jsx";

describe("Logo", () => {
  it("renders the logo image with accessible alt text (normal case)", () => {
    render(<Logo />);

    const img = screen.getByRole("img", { name: "CarSage" });
    expect(img.tagName).toBe("IMG");
  });

  it("sizes by height via the size prop, leaving width to the image's own aspect ratio", () => {
    render(<Logo size={64} />);

    const img = screen.getByRole("img", { name: "CarSage" });
    expect(img.style.height).toBe("64px");
    expect(img.style.width).toBe("auto");
  });

  it("defaults to a sensible size when none is given", () => {
    render(<Logo />);

    expect(screen.getByRole("img", { name: "CarSage" }).style.height).toBe("32px");
  });

  it("passes through an extra className alongside the base logo class", () => {
    render(<Logo className="landing-hero__logo" />);

    const img = screen.getByRole("img", { name: "CarSage" });
    expect(img.className).toContain("logo");
    expect(img.className).toContain("landing-hero__logo");
  });

  it("renders the same image everywhere it's used at a given color, no size-specific asset swap", () => {
    const { unmount } = render(<Logo size={28} />);
    const smallSrc = screen.getByRole("img", { name: "CarSage" }).src;
    unmount();

    render(<Logo size={64} />);
    const largeSrc = screen.getByRole("img", { name: "CarSage" }).src;

    expect(smallSrc).toBe(largeSrc);
  });

  // CAR-80: `mark` crops the same file to its icon in CSS (.logo--mark), so there is no second
  // asset. The name is then carried by text beside it, so the image is decorative.
  it("mark shows the same artwork, decorative, for a caller that writes the wordmark itself", () => {
    const { unmount } = render(<Logo size={44} />);
    const fullSrc = screen.getByRole("img", { name: "CarSage" }).src;
    unmount();

    const { container } = render(<Logo size={44} mark />);

    const img = container.querySelector("img");
    expect(img.src).toBe(fullSrc);
    expect(img.alt).toBe("");
    expect(img.className).toContain("logo--mark");
    // The crop is the CSS box (.logo--mark sets the aspect ratio), so the inline sizing is unchanged.
    expect([img.style.height, img.style.width]).toEqual(["44px", "auto"]);
    expect(screen.queryByRole("img", { name: "CarSage" })).not.toBeInTheDocument();
  });

  it("swaps in the white on-dark variant when onDark is set, for the dark green header", () => {
    const { unmount } = render(<Logo />);
    const lightSrc = screen.getByRole("img", { name: "CarSage" }).src;
    unmount();

    render(<Logo onDark />);
    const darkSrc = screen.getByRole("img", { name: "CarSage" }).src;

    expect(darkSrc).not.toBe(lightSrc);
    expect(darkSrc).toMatch(/on-dark/);
  });
});

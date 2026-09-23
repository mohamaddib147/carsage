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

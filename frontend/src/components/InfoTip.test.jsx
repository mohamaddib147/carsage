// Tests for InfoTip (CAR-45): hidden by default, shows on hover and on
// keyboard focus, hides on mouse leave, and — for touch devices with no
// hover — a tap toggles it open and it stays open until tapped again,
// tapped elsewhere, or Escape is pressed.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import InfoTip from "./InfoTip.jsx";

function renderTip() {
  render(
    <div>
      <p>Somewhere else</p>
      <InfoTip label="About this estimate">Ideal conditions only.</InfoTip>
    </div>,
  );
  return screen.getByRole("button", { name: "About this estimate" });
}

describe("InfoTip", () => {
  it("is hidden until interacted with", () => {
    renderTip();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows on hover and hides again on mouse leave (desktop)", async () => {
    const user = userEvent.setup();
    const button = renderTip();

    await user.hover(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Ideal conditions only.");

    await user.unhover(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows on keyboard focus and hides on blur", async () => {
    const user = userEvent.setup();
    renderTip();

    await user.tab();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on tap and stays open after the pointer leaves (mobile)", async () => {
    const user = userEvent.setup();
    const button = renderTip();

    await user.click(button);
    await user.unhover(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("closes when tapped again", async () => {
    const user = userEvent.setup();
    const button = renderTip();

    await user.click(button);
    await user.click(button);
    await user.unhover(button);
    // A second click unpins; hover/focus also cleared by moving away.
    await user.click(screen.getByText("Somewhere else"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes a tapped-open tooltip when tapping elsewhere", async () => {
    const user = userEvent.setup();
    const button = renderTip();

    await user.click(button);
    await user.unhover(button);
    await user.click(screen.getByText("Somewhere else"));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes a tapped-open tooltip on Escape", async () => {
    const user = userEvent.setup();
    const button = renderTip();

    await user.click(button);
    await user.unhover(button);
    await user.keyboard("{Escape}");
    // Focus is still on the button (which also shows it) — blur it too.
    button.blur();

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

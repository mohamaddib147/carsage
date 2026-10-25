// CAR-81: the maintenance status badge always shows its words AND an icon, a different icon for each status, hidden from assistive tech
// (the words carry the meaning), and the CSS class the fixed status colours hang on. Status is never carried by colour alone.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StatusBadge from "./StatusBadge.jsx";
import { STATUS, STATUS_LABELS } from "../lib/maintenance.js";

const ALL = [STATUS.OVERDUE, STATUS.DUE_SOON, STATUS.OK, STATUS.NEEDS_READING];

describe("StatusBadge", () => {
  it.each(ALL)("%s: its words, one decorative icon, and its status class", (status) => {
    const { container } = render(<StatusBadge status={status} />);
    const badge = screen.getByText(STATUS_LABELS[status]);
    expect(badge).toHaveClass("maintenance-badge", `maintenance-badge--${status}`);
    const icon = container.querySelector("svg.icon");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(badge).toContainElement(icon);
  });

  it("every status has a different icon, so colour is never the only difference", () => {
    const drawings = ALL.map((status) => {
      const { container, unmount } = render(<StatusBadge status={status} />);
      const drawing = container.querySelector("svg").innerHTML;
      unmount();
      return drawing;
    });
    expect(new Set(drawings).size).toBe(ALL.length);
  });

  it("the accessible name of a badge is its words only (the icon adds nothing to read out)", () => {
    render(<StatusBadge status={STATUS.OVERDUE} />);
    expect(screen.getByText("Overdue").textContent).toBe("Overdue");
  });
});

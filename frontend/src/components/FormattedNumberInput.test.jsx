// Tests for FormattedNumberInput (thousand separators on Trip Planner's
// Fuel Price / Tank Size fields): the display is formatted while the value
// handed to the parent stays a raw, comma-free string; junk characters are
// dropped; decimals only when allowed; and the caret stays where the user
// is editing.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import FormattedNumberInput, {
  formatNumberString,
  sanitizeNumberString,
} from "./FormattedNumberInput.jsx";

/** Harness that keeps the raw value like a real parent, exposing it for asserts. */
function Harness({ initial = "", allowDecimal = false, onRaw = () => {} }) {
  const [raw, setRaw] = useState(initial);
  return (
    <div>
      <label htmlFor="n">Number</label>
      <FormattedNumberInput
        id="n"
        value={raw}
        allowDecimal={allowDecimal}
        onChange={(next) => {
          setRaw(next);
          onRaw(next);
        }}
      />
    </div>
  );
}

describe("formatNumberString / sanitizeNumberString", () => {
  it.each([
    ["", ""],
    ["5", "5"],
    ["999", "999"],
    ["1000", "1,000"],
    ["140500", "140,500"],
    ["1234567", "1,234,567"],
    ["43.5", "43.5"],
    ["1234.5678", "1,234.5678"],
    ["1234.", "1,234."],
  ])("formats %j as %j", (raw, expected) => {
    expect(formatNumberString(raw)).toBe(expected);
  });

  it("keeps only digits (and one dot when decimals are allowed)", () => {
    expect(sanitizeNumberString("1,234abc", false)).toBe("1234");
    expect(sanitizeNumberString("12.5", false)).toBe("125");
    expect(sanitizeNumberString("1,234.5.6", true)).toBe("1234.56");
    expect(sanitizeNumberString("-5e3", true)).toBe("53");
  });
});

describe("FormattedNumberInput", () => {
  it("shows a raw value with thousand separators", () => {
    render(<Harness initial="140500" />);

    expect(screen.getByLabelText("Number")).toHaveValue("140,500");
  });

  it("formats as you type while the parent still gets the raw digits (normal case)", async () => {
    const user = userEvent.setup();
    const onRaw = vi.fn();
    render(<Harness onRaw={onRaw} />);

    await user.type(screen.getByLabelText("Number"), "140500");

    expect(screen.getByLabelText("Number")).toHaveValue("140,500");
    expect(onRaw).toHaveBeenLastCalledWith("140500");
    expect(Number(onRaw.mock.lastCall[0])).toBe(140500);
  });

  it("drops letters and symbols (invalid input)", async () => {
    const user = userEvent.setup();
    const onRaw = vi.fn();
    render(<Harness onRaw={onRaw} />);

    await user.type(screen.getByLabelText("Number"), "1a2-3e.4");

    expect(screen.getByLabelText("Number")).toHaveValue("1,234");
    expect(onRaw).toHaveBeenLastCalledWith("1234");
  });

  it("accepts a decimal point only when decimals are allowed", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness allowDecimal />);
    await user.type(screen.getByLabelText("Number"), "43.5");
    expect(screen.getByLabelText("Number")).toHaveValue("43.5");
    unmount();

    render(<Harness />);
    await user.type(screen.getByLabelText("Number"), "43.5");
    expect(screen.getByLabelText("Number")).toHaveValue("435");
  });

  it("cleans up a pasted formatted number", async () => {
    const user = userEvent.setup();
    const onRaw = vi.fn();
    render(<Harness onRaw={onRaw} />);

    await user.click(screen.getByLabelText("Number"));
    await user.paste("1,234,567");

    expect(screen.getByLabelText("Number")).toHaveValue("1,234,567");
    expect(onRaw).toHaveBeenLastCalledWith("1234567");
  });

  it("can be cleared back to empty", async () => {
    const user = userEvent.setup();
    const onRaw = vi.fn();
    render(<Harness initial="140500" onRaw={onRaw} />);

    await user.clear(screen.getByLabelText("Number"));

    expect(screen.getByLabelText("Number")).toHaveValue("");
    expect(onRaw).toHaveBeenLastCalledWith("");
  });

  it("keeps the caret in place when editing in the middle of the number", async () => {
    const user = userEvent.setup();
    render(<Harness initial="140500" />);
    const input = screen.getByLabelText("Number");

    // Caret after "140" (3 characters in): 140|,500 -> type a 9 -> 1409|500.
    input.focus();
    input.setSelectionRange(3, 3);
    await user.keyboard("9");

    expect(input).toHaveValue("1,409,500");
    // Four real digits ("1409") sit before the caret, i.e. after "1,409".
    expect(input.selectionStart).toBe(5);
  });

  it("keeps the caret in place after a rejected character", async () => {
    const user = userEvent.setup();
    render(<Harness initial="1234" />);
    const input = screen.getByLabelText("Number");

    input.focus();
    input.setSelectionRange(1, 1);
    await user.keyboard("x");

    expect(input).toHaveValue("1,234");
    expect(input.selectionStart).toBe(1);
  });

  it("uses a numeric keypad hint and a text input", () => {
    render(<Harness allowDecimal />);
    const input = screen.getByLabelText("Number");

    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "decimal");
  });
});

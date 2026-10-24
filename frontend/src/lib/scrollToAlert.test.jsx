// Tests lib/scrollToAlert.js (QA fix): the first alert inside the given container is scrolled to the middle of the
// screen once the message has rendered; nothing scrolls before it is asked to, a missing alert is harmless, and every
// call scrolls once more (a second tap with the same mistake).

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollToAlert } from "./scrollToAlert.js";

function Form({ withAlert = true, scopeToForm = true }) {
  const [shown, setShown] = useState(false);
  const scrollToAlert = useScrollToAlert();
  return (
    <div>
      <p role="alert">A message elsewhere on the page</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setShown(true);
          scrollToAlert(scopeToForm ? event.currentTarget : undefined);
        }}
      >
        {shown && withAlert && <p role="alert">Enter an amount.</p>}
        <button type="submit">Save</button>
      </form>
    </div>
  );
}

let scrolled;

beforeEach(() => {
  scrolled = [];
  Element.prototype.scrollIntoView = vi.fn(function scroll(options) {
    scrolled.push([this.textContent, options]);
  });
});

afterEach(() => {
  delete Element.prototype.scrollIntoView;
});

describe("useScrollToAlert", () => {
  it("scrolls nothing until it is called", () => {
    render(<Form />);
    expect(scrolled).toEqual([]);
  });

  it("scrolls the first alert inside the form to the middle of the screen, once the message is shown", async () => {
    render(<Form />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(scrolled).toEqual([["Enter an amount.", { block: "center" }]]);
  });

  it("with no container, scrolls the first alert on the page", async () => {
    render(<Form scopeToForm={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(scrolled).toEqual([["A message elsewhere on the page", { block: "center" }]]);
  });

  it("scrolls again on the next call, and does nothing when there is no alert in the container", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Form />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(scrolled).toHaveLength(2);

    scrolled.length = 0;
    rerender(<Form withAlert={false} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(scrolled).toEqual([]);
  });

  it("does not throw where scrollIntoView does not exist", async () => {
    delete Element.prototype.scrollIntoView;
    render(<Form />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter an amount.")).toBeInTheDocument();
  });
});

// Tests for ColdStartBanner (professional-polish pass, no Jira task):
// renders nothing until lib/coldStart.js reports a slow request, then
// shows a friendly message, and goes away again once it clears.

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ColdStartBanner from "./ColdStartBanner.jsx";
import * as coldStart from "../lib/coldStart.js";

describe("ColdStartBanner", () => {
  it("renders nothing while no request is slow (normal case)", () => {
    vi.spyOn(coldStart, "onColdStartChange").mockImplementation(() => () => {});

    const { container } = render(<ColdStartBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the message once the tracker reports a slow request, and hides it again once it clears", () => {
    let notify;
    vi.spyOn(coldStart, "onColdStartChange").mockImplementation((listener) => {
      notify = listener;
      return () => {};
    });

    render(<ColdStartBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => notify(true));
    expect(screen.getByRole("status")).toHaveTextContent("Waking up the server");

    act(() => notify(false));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("unsubscribes on unmount", () => {
    const unsubscribe = vi.fn();
    vi.spyOn(coldStart, "onColdStartChange").mockImplementation(() => unsubscribe);

    const { unmount } = render(<ColdStartBanner />);
    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});

// Tests for the currency preference provider (CAR-54): it starts from what was
// saved on the last visit (so the choice survives a page reload), saves every
// change, ignores anything that isn't USD or LBP, and keeps working when the
// browser's storage is blocked.

import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrencyProvider, useCurrency } from "./CurrencyContext.jsx";
import { CURRENCY_STORAGE_KEY } from "../lib/currency.js";

function wrapper({ children }) {
  return <CurrencyProvider>{children}</CurrencyProvider>;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CurrencyProvider", () => {
  it("starts on USD for a first-time visitor", () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });

    expect(result.current.currency).toBe("USD");
  });

  it("switches currency and saves the choice", () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });

    act(() => result.current.setCurrency("LBP"));

    expect(result.current.currency).toBe("LBP");
    expect(window.localStorage.getItem(CURRENCY_STORAGE_KEY)).toBe("LBP");
  });

  it("remembers the choice after a page reload (a fresh provider reads what was saved)", () => {
    const first = renderHook(() => useCurrency(), { wrapper });
    act(() => first.result.current.setCurrency("LBP"));
    first.unmount(); // the page is closed ...

    const second = renderHook(() => useCurrency(), { wrapper }); // ... and opened again

    expect(second.result.current.currency).toBe("LBP");
  });

  it("remembers USD too, so switching back is also kept", () => {
    const first = renderHook(() => useCurrency(), { wrapper });
    act(() => first.result.current.setCurrency("LBP"));
    act(() => first.result.current.setCurrency("USD"));
    first.unmount();

    expect(renderHook(() => useCurrency(), { wrapper }).result.current.currency).toBe("USD");
  });

  it("ignores a value that isn't USD or LBP", () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });

    act(() => result.current.setCurrency("EUR"));
    act(() => result.current.setCurrency(undefined));

    expect(result.current.currency).toBe("USD");
    expect(window.localStorage.getItem(CURRENCY_STORAGE_KEY)).toBeNull();
  });

  it("falls back to USD when the saved value is corrupt", () => {
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, "bitcoin");

    expect(renderHook(() => useCurrency(), { wrapper }).result.current.currency).toBe("USD");
  });

  it("still switches (just doesn't remember) when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useCurrency(), { wrapper });

    act(() => result.current.setCurrency("LBP"));

    expect(result.current.currency).toBe("LBP");
  });

  it("gives every component under it the same value", async () => {
    const user = userEvent.setup();
    function Show({ id }) {
      const { currency } = useCurrency();
      return <p data-testid={id}>{currency}</p>;
    }
    function Switch() {
      const { setCurrency } = useCurrency();
      return <button onClick={() => setCurrency("LBP")}>go LBP</button>;
    }
    render(
      <CurrencyProvider>
        <Show id="a" />
        <Show id="b" />
        <Switch />
      </CurrencyProvider>,
    );

    await user.click(screen.getByRole("button", { name: "go LBP" }));

    expect(screen.getByTestId("a")).toHaveTextContent("LBP");
    expect(screen.getByTestId("b")).toHaveTextContent("LBP");
  });
});

describe("useCurrency without a provider", () => {
  it("is a working USD default rather than a crash", () => {
    const { result } = renderHook(() => useCurrency());

    expect(result.current.currency).toBe("USD");
    expect(() => result.current.setCurrency("LBP")).not.toThrow();
  });
});

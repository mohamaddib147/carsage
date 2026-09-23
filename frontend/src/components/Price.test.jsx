// Tests for <Price> and the header's currency switch (CAR-54): every price shows
// both currencies, the chosen primary one first and bold, the other muted, and the
// conversion always uses the one fixed rate.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import CurrencyToggle from "./CurrencyToggle.jsx";
import Price from "./Price.jsx";
import { CurrencyProvider } from "../currency/CurrencyContext.jsx";
import { CURRENCY_STORAGE_KEY } from "../lib/currency.js";

function renderWith(ui, { stored } = {}) {
  window.localStorage.clear();
  if (stored) window.localStorage.setItem(CURRENCY_STORAGE_KEY, stored);
  return render(<CurrencyProvider>{ui}</CurrencyProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("Price — USD primary (the default)", () => {
  it("shows dollars first and bold, pounds after in parentheses", () => {
    const { container } = renderWith(<Price amount={2_691_000} currency="LBP" />);

    expect(container.querySelector(".price")).toHaveTextContent("$30.00 (2,691,000 LBP)");
    expect(container.querySelector(".price__primary")).toHaveTextContent("$30.00");
    expect(container.querySelector(".price__primary").tagName).toBe("STRONG");
    expect(container.querySelector(".price__secondary")).toHaveTextContent("(2,691,000 LBP)");
  });

  it("converts an amount that was typed in dollars", () => {
    const { container } = renderWith(<Price amount={30} currency="USD" />);

    expect(container.querySelector(".price")).toHaveTextContent("$30.00 (2,691,000 LBP)");
  });
});

describe("Price — LBP primary", () => {
  it("shows pounds first and bold, dollars after in parentheses", () => {
    const { container } = renderWith(<Price amount={30} currency="USD" />, { stored: "LBP" });

    expect(container.querySelector(".price")).toHaveTextContent("2,691,000 LBP ($30.00)");
    expect(container.querySelector(".price__primary")).toHaveTextContent("2,691,000 LBP");
    expect(container.querySelector(".price__secondary")).toHaveTextContent("($30.00)");
  });

  it("marks which currency is primary for styling and tests", () => {
    const { container } = renderWith(<Price amount={30} currency="USD" />, { stored: "LBP" });

    expect(container.querySelector(".price")).toHaveAttribute("data-primary", "LBP");
  });
});

describe("Price — details", () => {
  it("puts a suffix such as /L after both figures", () => {
    const { container } = renderWith(<Price amount={140_500} currency="LBP" suffix="/L" />);

    expect(container.querySelector(".price")).toHaveTextContent("$1.57/L (140,500 LBP/L)");
  });

  it("rounds only when showing: dollars to cents, pounds to whole pounds", () => {
    const { container } = renderWith(<Price amount={1} currency="LBP" />);

    expect(container.querySelector(".price")).toHaveTextContent("$0.00 (1 LBP)");
  });

  it("shows zero cleanly", () => {
    const { container } = renderWith(<Price amount={0} currency="USD" />);

    expect(container.querySelector(".price")).toHaveTextContent("$0.00 (0 LBP)");
  });

  it("shows exactly the same two amounts whichever currency is primary", () => {
    const usdFirst = renderWith(<Price amount={45} currency="USD" />).container.textContent;
    const lbpFirst = renderWith(<Price amount={45} currency="USD" />, { stored: "LBP" }).container.textContent;

    expect(usdFirst).toBe("$45.00 (4,036,500 LBP)");
    expect(lbpFirst).toBe("4,036,500 LBP ($45.00)");
  });
});

describe("CurrencyToggle", () => {
  it("offers USD and LBP, with the current one pressed", () => {
    renderWith(<CurrencyToggle />);

    expect(screen.getByRole("group", { name: "Show prices in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "USD" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "LBP" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches every price under it when a currency is picked", async () => {
    const user = userEvent.setup();
    const { container } = renderWith(
      <>
        <CurrencyToggle />
        <Price amount={30} currency="USD" />
        <Price amount={45} currency="USD" />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "LBP" }));

    expect(screen.getByRole("button", { name: "LBP" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "USD" })).toHaveAttribute("aria-pressed", "false");
    expect([...container.querySelectorAll(".price")].map((node) => node.textContent)).toEqual([
      "2,691,000 LBP ($30.00)",
      "4,036,500 LBP ($45.00)",
    ]);
  });

  it("starts on the saved currency", () => {
    renderWith(<CurrencyToggle />, { stored: "LBP" });

    expect(screen.getByRole("button", { name: "LBP" })).toHaveAttribute("aria-pressed", "true");
  });
});

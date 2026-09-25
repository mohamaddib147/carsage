// Guards the wiring of the currency preference (CAR-54): the app entry point must
// wrap the whole app in <CurrencyProvider>, otherwise the header switch would look
// like it works while every price stayed on USD (the context's silent default).
// It reads main.jsx as text, so it needs no browser.

import { describe, expect, it } from "vitest";
import mainSource from "../main.jsx?raw";

describe("main.jsx wiring", () => {
  it("wraps <App /> in the CurrencyProvider", () => {
    expect(mainSource).toContain('import { CurrencyProvider } from "./currency/CurrencyContext.jsx"');
    // <App /> may be nested inside other providers (e.g. ActiveCarProvider,
    // CAR-55) as long as CurrencyProvider is still an ancestor of it.
    expect(mainSource).toMatch(/<CurrencyProvider>[\s\S]*<App \/>[\s\S]*<\/CurrencyProvider>/);
  });

  it("keeps the AuthProvider (the switch is only shown to signed-in users) and the router around it", () => {
    expect(mainSource).toMatch(/<BrowserRouter>[\s\S]*<AuthProvider>[\s\S]*<CurrencyProvider>/);
  });
});

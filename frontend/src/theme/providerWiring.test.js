// Guards the wiring of car-brand theming (CAR-55): the app entry point must
// wrap the whole app in <ActiveCarProvider>, and it needs the AuthProvider
// above it (it reads the logged-in user to load their cars). Reads
// main.jsx as text, so it needs no browser.

import { describe, expect, it } from "vitest";
import mainSource from "../main.jsx?raw";

describe("main.jsx wiring (CAR-55)", () => {
  it("wraps <App /> in the ActiveCarProvider", () => {
    expect(mainSource).toContain('import { ActiveCarProvider } from "./theme/ActiveCarContext.jsx"');
    expect(mainSource).toMatch(/<ActiveCarProvider>[\s\S]*<App \/>[\s\S]*<\/ActiveCarProvider>/);
  });

  it("keeps the AuthProvider around it (theming needs the logged-in user's cars)", () => {
    expect(mainSource).toMatch(/<AuthProvider>[\s\S]*<ActiveCarProvider>/);
  });
});

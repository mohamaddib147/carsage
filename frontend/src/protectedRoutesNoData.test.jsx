// Protected routes never send a data request, and never show protected content, before the visitor is known to be
// signed in. The whole app is rendered the way main.jsx renders it (router, AuthProvider, CurrencyProvider,
// ActiveCarProvider, App) at every protected path, with a spy on every way the app talks to a backend: each Supabase
// data call (from, rpc) and fetch (the FastAPI client). Three situations:
//   - the first session check has not answered yet: skeleton only, no heading, no request;
//   - signed out: sent to Log In (the only page heading), no request;
//   - signed in (the control that proves the spies work): the same paths do send requests.

import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { CurrencyProvider } from "./currency/CurrencyContext.jsx";
import { supabase } from "./lib/supabaseClient.js";
import { ActiveCarProvider } from "./theme/ActiveCarContext.jsx";

vi.mock("./lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

/** A query builder whose every method returns itself and which resolves to an empty, successful reply. */
function emptyQuery() {
  const query = new Proxy(function () {}, {
    get: (_target, property) => (property === "then" ? (resolve) => resolve({ data: [], error: null, status: 200 }) : () => query),
    apply: () => query,
  });
  return query;
}

const PROTECTED_PATHS = ["/dashboard", "/cars/new", "/cars/mine", "/cars/abc-123", "/trip-planner", "/advisor", "/fuel-log", "/maintenance", "/expenses"];
const USER = { id: "user-1", email: "driver@example.com" };

let fetchSpy;

beforeEach(() => {
  vi.clearAllMocks();
  supabase.from.mockImplementation(() => emptyQuery());
  supabase.rpc.mockImplementation(() => emptyQuery());
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider><CurrencyProvider><ActiveCarProvider>
        <App />
      </ActiveCarProvider></CurrencyProvider></AuthProvider>
    </MemoryRouter>,
  );
}

/** Every request the app made so far, as readable strings. */
function requests() {
  return [
    ...supabase.from.mock.calls.map(([table]) => `from(${table})`),
    ...supabase.rpc.mock.calls.map(([name]) => `rpc(${name})`),
    ...fetchSpy.mock.calls.map(([url]) => `fetch(${String(url)})`),
  ];
}

/** Lets pending promises, effects and the next few frames run. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 60)));

describe.each(PROTECTED_PATHS)("protected route %s", (path) => {
  it("while the first session check is still running: only the loading skeleton, no heading, no request", async () => {
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    const { container } = renderApp(path);
    await settle();

    expect(container.querySelector(".route-loading")).toBeInTheDocument();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(requests()).toEqual([]);
  });

  it("signed out: sent to Log In, which is the only page heading, and no request is sent", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderApp(path);

    expect(await screen.findByRole("heading", { level: 1, name: "Log In" })).toBeInTheDocument();
    await settle();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(requests()).toEqual([]);
  });
});

describe("the control: the same app does send requests once signed in (so the spies above can see them)", () => {
  it("/dashboard asks for the user's own data after the session is known", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER, access_token: "token-1" } } });
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    await settle();
    expect(requests()).toEqual(expect.arrayContaining(["from(cars)", "from(fuel_logs)", "from(maintenance_items)"]));
  });
});

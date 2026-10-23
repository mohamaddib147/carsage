// CAR-71: a signed-in user who opens /login or /signup goes to the Dashboard
// (replace, so Back doesn't loop), but /reset-password is never redirected: a
// Supabase recovery link signs the browser in before the reset form shows.
// Rendered through the real App route table, so wrapping the reset route by
// mistake fails here. Nothing redirects while the first session check runs.

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { loginDestination, safeReturnPath } from "./auth/loginDestination.js";
import { CurrencyProvider } from "./currency/CurrencyContext.jsx";
import { supabase } from "./lib/supabaseClient.js";

vi.mock("./lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
      signInWithPassword: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}));

// The destination screens' own data loading is not under test here.
vi.mock("./pages/DashboardPage.jsx", () => ({ default: () => <h1>Dashboard</h1> }));
vi.mock("./pages/FuelLogPage.jsx", () => ({ default: () => <h1>Fuel Log</h1> }));

const SIGNED_IN = { user: { id: "user-1", email: "driver@example.com" }, access_token: "token-1" };

/** The listener AuthProvider registered, to fire auth events as supabase-js would. */
let authListener;

beforeEach(() => {
  vi.clearAllMocks();
  authListener = undefined;
  supabase.auth.onAuthStateChange.mockImplementation((callback) => {
    authListener = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
});

function fireAuthEvent(event, session) {
  act(() => authListener(event, session));
}

/** Shows where the router is and how it got there, and offers a Back button. */
function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="path">{location.pathname + location.search + location.hash}</output>
      <output data-testid="navigation-type">{navigationType}</output>
      <button type="button" onClick={() => navigate(-1)}>Probe back</button>
    </>
  );
}

function renderApp(entries, initialIndex = entries.length - 1) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
      <AuthProvider><CurrencyProvider>
        <App />
        <LocationProbe />
      </CurrencyProvider></AuthProvider>
    </MemoryRouter>,
  );
}

const path = () => screen.getByTestId("path").textContent;

describe("CAR-71: signed-out visitors see the forms", () => {
  it.each([
    ["/login", "Log In"],
    ["/signup", "Sign Up"],
  ])("%s shows the %s form and stays put", async (route, heading) => {
    renderApp([route]);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(path()).toBe(route);
  });
});

describe("CAR-71: signed-in visitors skip Log In and Sign Up", () => {
  beforeEach(() => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: SIGNED_IN } });
  });

  it.each(["/login", "/signup"])("%s goes to the Dashboard, the same place a successful log-in goes", async (route) => {
    renderApp([route]);

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(path()).toBe("/dashboard");
    expect(screen.queryByRole("heading", { name: /^(Log In|Sign Up)$/ })).not.toBeInTheDocument();
  });

  it("replaces the history entry: Back returns to the page before /login, not to /login (no loop)", async () => {
    const user = userEvent.setup();
    renderApp(["/", "/login"]);

    await screen.findByRole("heading", { name: "Dashboard" });
    expect(screen.getByTestId("navigation-type").textContent).toBe("REPLACE");

    await user.click(screen.getByRole("button", { name: "Probe back" }));
    await waitFor(() => expect(path()).toBe("/"));
  });

  it("sends the user back to the protected screen that sent them to log in, like a log-in does", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/login", state: { from: { pathname: "/fuel-log" } } }]}>
        <AuthProvider><CurrencyProvider>
          <App />
          <LocationProbe />
        </CurrencyProvider></AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(path()).toBe("/fuel-log"));
  });

  it("a log-in on the form lands on the Dashboard once, with no loop between the two redirects", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    supabase.auth.signInWithPassword.mockImplementation(async () => {
      fireAuthEvent("SIGNED_IN", SIGNED_IN);
      return { data: { session: SIGNED_IN }, error: null };
    });
    const user = userEvent.setup();
    renderApp(["/", "/login"]);

    await screen.findByRole("heading", { name: "Log In" });
    await user.type(screen.getByLabelText(/email/i), "driver@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(path()).toBe("/dashboard");
    await user.click(screen.getByRole("button", { name: "Probe back" }));
    await waitFor(() => expect(path()).toBe("/"));
  });
});

describe("CAR-71: /reset-password is never redirected", () => {
  it("a signed-in (recovery) session sees the reset form and stays", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: SIGNED_IN } });
    renderApp(["/reset-password"]);

    expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
    expect(await screen.findByLabelText("New password")).toBeInTheDocument();
    expect(path()).toBe("/reset-password");
  });

  it.each([
    ["the recovery link's URL hash (type=recovery, this app's implicit flow)", "/reset-password#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=recovery"],
    ["a ?code= parameter (PKCE flow, if it were ever turned on)", "/reset-password?code=0b8b4e52-recovery-code"],
  ])("with %s, the reset form shows and the URL is untouched", async (_label, url) => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: SIGNED_IN } });
    renderApp([url]);

    expect(await screen.findByLabelText("New password")).toBeInTheDocument();
    expect(path()).toBe(url);
    expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("a PASSWORD_RECOVERY event arriving after the page loaded shows the form and does not redirect", async () => {
    renderApp(["/reset-password#type=recovery"]);
    expect(await screen.findByText(/This reset link has expired or was already used/)).toBeInTheDocument();

    fireAuthEvent("PASSWORD_RECOVERY", SIGNED_IN);

    expect(await screen.findByLabelText("New password")).toBeInTheDocument();
    expect(path()).toBe("/reset-password#type=recovery");
  });

  it("a SIGNED_IN event on the reset page (already signed in, then the recovery event) still does not redirect", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: SIGNED_IN } });
    renderApp(["/reset-password"]);
    await screen.findByLabelText("New password");

    fireAuthEvent("SIGNED_IN", SIGNED_IN);
    fireAuthEvent("PASSWORD_RECOVERY", SIGNED_IN);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(path()).toBe("/reset-password");
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });
});

describe("CAR-71: nothing redirects while the first session check is still running", () => {
  it("a signed-in visitor to /login: no redirect and no visible login form until the check ends, then the Dashboard", async () => {
    let finishCheck;
    supabase.auth.getSession.mockReturnValue(new Promise((resolve) => { finishCheck = resolve; }));
    const { container } = renderApp(["/login"]);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(path()).toBe("/login");
    // The form is mounted in place (no layout jump) but hidden and inert.
    expect(container.querySelector("#email")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Log In" })).not.toBeInTheDocument();
    expect(container.querySelector("[inert]")).toContainElement(container.querySelector("#email"));

    await act(async () => finishCheck({ data: { session: SIGNED_IN } }));

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(path()).toBe("/dashboard");
  });

  it("a signed-out visitor: the form becomes visible and usable once the check ends, without a redirect", async () => {
    let finishCheck;
    supabase.auth.getSession.mockReturnValue(new Promise((resolve) => { finishCheck = resolve; }));
    const { container } = renderApp(["/signup"]);
    const emailInput = container.querySelector("#email");

    await act(async () => finishCheck({ data: { session: null } }));

    expect(await screen.findByRole("heading", { name: "Sign Up" })).toBeInTheDocument();
    expect(container.querySelector("[inert]")).not.toBeInTheDocument();
    // The same input element: the form was not remounted when it appeared.
    expect(container.querySelector("#email")).toBe(emailInput);
    expect(path()).toBe("/signup");
  });
});

describe("CAR-71: after Log Out", () => {
  it("/login opens normally, with no redirect loop", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: SIGNED_IN } });
    supabase.auth.signOut.mockImplementation(async () => {
      fireAuthEvent("SIGNED_OUT", null);
      return { error: null };
    });
    const user = userEvent.setup();
    renderApp(["/dashboard"]);
    await screen.findByRole("heading", { name: "Dashboard" });

    await user.click(screen.getByRole("button", { name: "Log Out" }));

    expect(await screen.findByRole("heading", { name: "Log In" })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(path()).toBe("/login");
    expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();
  });
});

describe("CAR-71: the return path after logging in can only be a path inside this app", () => {
  it.each([
    ["/fuel-log", "/fuel-log"],
    ["/cars/abc-123", "/cars/abc-123"],
    [undefined, "/dashboard"],
    [null, "/dashboard"],
    [42, "/dashboard"],
    ["", "/dashboard"],
    ["fuel-log", "/dashboard"],
    ["//evil.example", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    ["/cars//x", "/dashboard"],
    ["https://evil.example/", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
    ["/dash\nboard", "/dashboard"],
    ["/login", "/dashboard"],
    ["/signup/", "/dashboard"],
    ["/LOGIN", "/dashboard"],
  ])("%j -> %s", (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });

  it("reads the router state that ProtectedRoute sets, and nothing else", () => {
    expect(loginDestination({ state: { from: { pathname: "/expenses" } } })).toBe("/expenses");
    expect(loginDestination({ state: null })).toBe("/dashboard");
    expect(loginDestination({ search: "?next=/expenses" })).toBe("/dashboard");
    expect(loginDestination(undefined)).toBe("/dashboard");
  });
});

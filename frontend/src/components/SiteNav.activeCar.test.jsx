// Tests that the header's "Manage car" menu opens the ACTIVE car's page (the first entry follows the car picked with
// the Dashboard pills), falls back to /cars/mine while there is no active car, and that the old "My Car" name is gone.
// useActiveCar is mocked so the car can be set directly; the rest of the menu is covered in SiteNav.test.jsx.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteNav from "./SiteNav.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { CurrencyProvider } from "../currency/CurrencyContext.jsx";
import { useActiveCar } from "../theme/ActiveCarContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(),
    },
  },
}));
vi.mock("../theme/ActiveCarContext.jsx", () => ({ useActiveCar: vi.fn() }));

/** Opens the Manage car menu on the Dashboard with the given active car id. */
async function openMenu(activeCarId) {
  useActiveCar.mockReturnValue({ activeCarId });
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider><CurrencyProvider><SiteNav /></CurrencyProvider></AuthProvider>
    </MemoryRouter>,
  );
  await userEvent.setup().click(await screen.findByRole("button", { name: "Manage car" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: "user-123", email: "driver@example.com" } } } });
});

describe("SiteNav 'Manage car' menu follows the active car", () => {
  it("links its first entry to the active car's page", async () => {
    await openMenu("car-b");

    expect(screen.getByRole("link", { name: "Car Profile" })).toHaveAttribute("href", "/cars/car-b");
  });

  it("falls back to /cars/mine when there is no active car yet", async () => {
    await openMenu(null);

    expect(screen.getByRole("link", { name: "Car Profile" })).toHaveAttribute("href", "/cars/mine");
  });

  it("keeps Fuel Log, Maintenance, Expenses and Add a car in the menu", async () => {
    await openMenu("car-b");

    const links = screen.getAllByRole("link").filter((link) => link.closest(".site-nav__menu-list"));
    expect(links.map((link) => link.textContent)).toEqual(["Car Profile", "Fuel Log", "Maintenance", "Expenses", "Add a car"]);
  });

  it("is no longer called My Car", async () => {
    await openMenu("car-b");

    expect(screen.queryByRole("button", { name: "My Car" })).not.toBeInTheDocument();
  });
});

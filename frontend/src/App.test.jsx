// Tests that routing renders the correct placeholder screen for each of
// the 7 CarSage screens, plus the unknown-route (404) edge case.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App.jsx";

/**
 * Renders <App /> with the router's initial history set to the given path.
 * @param {string} path
 */
function renderAtPath(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routing", () => {
  it("renders the Landing screen at /", () => {
    renderAtPath("/");
    expect(
      screen.getByRole("heading", { name: "CarSage" }),
    ).toBeInTheDocument();
  });

  it("renders the Log In screen at /login", () => {
    renderAtPath("/login");
    expect(screen.getByRole("heading", { name: "Log In" })).toBeInTheDocument();
  });

  it("renders the Sign Up screen at /signup", () => {
    renderAtPath("/signup");
    expect(
      screen.getByRole("heading", { name: "Sign Up" }),
    ).toBeInTheDocument();
  });

  it("renders the Dashboard screen at /dashboard", () => {
    renderAtPath("/dashboard");
    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("renders the Car Onboarding screen at /cars/new", () => {
    renderAtPath("/cars/new");
    expect(
      screen.getByRole("heading", { name: "Add a Car" }),
    ).toBeInTheDocument();
  });

  it("renders the Car Profile screen with the id from the URL (edge case: route param)", () => {
    renderAtPath("/cars/abc-123");
    expect(
      screen.getByText('View and edit specs for car "abc-123".'),
    ).toBeInTheDocument();
  });

  it("renders the Trip Planner screen at /trip-planner", () => {
    renderAtPath("/trip-planner");
    expect(
      screen.getByRole("heading", { name: "Trip Planner" }),
    ).toBeInTheDocument();
  });

  it("renders the AI Advisor screen at /advisor", () => {
    renderAtPath("/advisor");
    expect(
      screen.getByRole("heading", { name: "AI Advisor" }),
    ).toBeInTheDocument();
  });

  it("renders the Not Found screen for an unknown route (invalid input case)", () => {
    renderAtPath("/this-route-does-not-exist");
    expect(
      screen.getByRole("heading", { name: "Page Not Found" }),
    ).toBeInTheDocument();
  });

  it("renders nav links for all 7 screens", () => {
    renderAtPath("/");
    const nav = screen.getByRole("navigation");
    expect(nav.querySelectorAll("a")).toHaveLength(7);
  });
});

// Tests for RouteMapImage (CAR-48): the static map URL carries the route and
// key, the no-origin variant still works, it renders nothing without a key,
// it disappears (without throwing) when the image fails to load, and it is
// purely decorative / non-interactive.

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RouteMapImage, { buildStaticMapUrl } from "./RouteMapImage.jsx";

beforeEach(() => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildStaticMapUrl", () => {
  it("builds a Static Maps URL with both markers, a path and the key (normal case)", () => {
    const url = new URL(buildStaticMapUrl("Beirut, Lebanon", "Tripoli, Lebanon", "k1"));

    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/staticmap");
    expect(url.searchParams.get("key")).toBe("k1");
    expect(url.searchParams.get("size")).toBe("640x160");
    const markers = url.searchParams.getAll("markers");
    expect(markers).toHaveLength(2);
    expect(markers[0]).toContain("Beirut, Lebanon");
    expect(markers[1]).toContain("Tripoli, Lebanon");
    expect(url.searchParams.get("path")).toContain("Beirut, Lebanon|Tripoli, Lebanon");
  });

  it("falls back to a destination-only marker when there is no origin", () => {
    const url = new URL(buildStaticMapUrl("  ", "Tripoli, Lebanon", "k1"));

    expect(url.searchParams.getAll("markers")).toHaveLength(1);
    expect(url.searchParams.get("path")).toBeNull();
  });

  it("returns null without a key or without a destination", () => {
    expect(buildStaticMapUrl("Beirut", "Tripoli", "")).toBeNull();
    expect(buildStaticMapUrl("Beirut", "  ", "k1")).toBeNull();
  });
});

describe("RouteMapImage", () => {
  it("renders a decorative image for the route", () => {
    const { container } = render(<RouteMapImage origin="Beirut" destination="Tripoli" />);

    expect(screen.getByTestId("route-map")).toBeInTheDocument();
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", expect.stringContaining("maps.googleapis.com/maps/api/staticmap"));
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
  });

  it("is not interactive: no links, buttons or focusable controls", () => {
    const { container } = render(<RouteMapImage origin="Beirut" destination="Tripoli" />);

    expect(container.querySelector("a, button, input, [tabindex]")).toBeNull();
  });

  it("renders nothing when no browser key is configured", () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "");
    render(<RouteMapImage origin="Beirut" destination="Tripoli" />);

    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
  });

  it("removes itself when the image fails to load", () => {
    const { container } = render(<RouteMapImage origin="Beirut" destination="Tripoli" />);

    fireEvent.error(container.querySelector("img"));

    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
  });

  it("tries again for a different route after a failure", () => {
    const { container, rerender } = render(
      <RouteMapImage origin="Beirut" destination="Tripoli" />,
    );
    fireEvent.error(container.querySelector("img"));
    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();

    rerender(<RouteMapImage origin="Beirut" destination="Byblos" />);

    expect(screen.getByTestId("route-map")).toBeInTheDocument();
  });
});

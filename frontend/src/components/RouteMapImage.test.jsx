// Tests for RouteMapImage (CAR-48): the static map URL carries the driving
// route as an encoded polyline (path=enc:..., never a straight
// origin|destination line) plus markers and the key, the no-origin variant
// still works, it renders nothing without a key,
// it disappears (without throwing) when the image fails to load, and it is
// purely decorative / non-interactive.

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RouteMapImage, { buildStaticMapUrl } from "./RouteMapImage.jsx";

const POLYLINE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"; // ~ | ` @ need URL encoding

beforeEach(() => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildStaticMapUrl", () => {
  it("builds a Static Maps URL with both markers, the route polyline and the key (normal case)", () => {
    const url = new URL(
      buildStaticMapUrl("Beirut, Lebanon", "Tripoli, Lebanon", "k1", POLYLINE),
    );

    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/staticmap");
    expect(url.searchParams.get("key")).toBe("k1");
    expect(url.searchParams.get("size")).toBe("640x300");
    const markers = url.searchParams.getAll("markers");
    expect(markers).toHaveLength(2);
    expect(markers[0]).toContain("Beirut, Lebanon");
    expect(markers[1]).toContain("Tripoli, Lebanon");
    // The special characters in an encoded polyline must survive URL encoding.
    expect(url.searchParams.get("path")).toBe(`color:0x00594Cff|weight:4|enc:${POLYLINE}`);
  });

  it("never draws a straight origin-to-destination line when there is no polyline", () => {
    const url = new URL(buildStaticMapUrl("Beirut", "Tripoli", "k1", null));

    expect(url.searchParams.getAll("markers")).toHaveLength(2);
    expect(url.searchParams.get("path")).toBeNull();
  });

  it("drops the route and keeps the markers when the polyline would make the URL too long", () => {
    const url = new URL(buildStaticMapUrl("Beirut", "Tripoli", "k1", "a".repeat(17000)));

    expect(url.searchParams.get("path")).toBeNull();
    expect(url.searchParams.getAll("markers")).toHaveLength(2);
  });

  it("falls back to a destination-only marker when there is no origin", () => {
    const url = new URL(buildStaticMapUrl("  ", "Tripoli, Lebanon", "k1", POLYLINE));

    expect(url.searchParams.getAll("markers")).toHaveLength(1);
    // The real route is still drawn — it doesn't depend on the origin text.
    expect(url.searchParams.get("path")).toContain("enc:");
  });

  it("returns null without a key or without a destination", () => {
    expect(buildStaticMapUrl("Beirut", "Tripoli", "")).toBeNull();
    expect(buildStaticMapUrl("Beirut", "  ", "k1")).toBeNull();
  });
});

describe("RouteMapImage", () => {
  it("renders a decorative image that draws the route polyline", () => {
    const { container } = render(
      <RouteMapImage origin="Beirut" destination="Tripoli" polyline={POLYLINE} />,
    );

    expect(screen.getByTestId("route-map")).toBeInTheDocument();
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", expect.stringContaining("maps.googleapis.com/maps/api/staticmap"));
    expect(decodeURIComponent(img.getAttribute("src"))).toContain(`enc:${POLYLINE}`);
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

// CAR-76: the icon set (icons.jsx: the shared Icon wrapper and the four entry-chunk icons; iconsMore.jsx: the other 23). Every icon renders one
// SVG that is hidden from assistive tech by default, becomes a labelled image when given a title, takes the shared size and class; both files
// keep the licence notices Lucide's licences require (ISC for Lucide, MIT for the Feather-derived icons); no icon library was added to
// package.json; and icons.jsx stays at its four icons, because anything exported from the file the entry chunk imports is built into the
// entry chunk.

import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as entry from "./icons.jsx";
import * as more from "./iconsMore.jsx";

const { Icon, ...entryIcons } = entry;
const all = { ...entryIcons, ...more };
const names = Object.keys(all);
const entrySource = readFileSync("src/components/icons.jsx", "utf8");
const moreSource = readFileSync("src/components/iconsMore.jsx", "utf8");

describe("the icon set", () => {
  it("icons.jsx holds the shared Icon wrapper and exactly the four entry-chunk icons", () => {
    expect(typeof Icon).toBe("function");
    expect(Object.keys(entryIcons).sort()).toEqual(["ArrowRight", "Check", "ChevronDown", "Sparkle"]);
  });

  it("iconsMore.jsx holds the other 23, so 27 icons in all with no duplicates", () => {
    expect(Object.keys(more)).toHaveLength(23);
    expect(names).toHaveLength(27);
    expect(new Set(names).size).toBe(27);
    for (const expected of ["Camera", "Trash2", "MapPin", "Play", "Car", "Fuel", "Lock"]) {
      expect(Object.keys(more)).toContain(expected);
    }
  });

  it.each(names)("%s renders one decorative SVG with shapes, 20 px by default", (name) => {
    const Component = all[name];
    const { container } = render(<Component />);
    const svg = container.querySelector("svg");
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(svg).toHaveClass("icon");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).not.toHaveAttribute("role");
    expect(svg).toHaveAttribute("width", "20");
    expect(svg).toHaveAttribute("height", "20");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    const shapes = [...svg.querySelectorAll("path, circle, rect, line, polyline, polygon, ellipse")];
    expect(shapes.length).toBeGreaterThan(0);
    // Every shape carries its geometry (a shape with no attributes draws nothing: Hash once lost its x1 and y1).
    for (const shape of shapes) expect(shape.attributes.length).toBeGreaterThan(0);
  });

  it("takes a size and extra classes", () => {
    const { container } = render(<entry.Check size={14} className="icon--turn" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "14");
    expect(svg).toHaveClass("icon", "icon--turn");
  });

  it("a title makes it a meaningful image: role img and that label, no longer hidden", () => {
    const { getByRole } = render(<more.Camera title="Take a photo" />);
    const image = getByRole("img", { name: "Take a photo" });
    expect(image).not.toHaveAttribute("aria-hidden");
  });
});

describe("licence notices and rules", () => {
  it.each([
    ["icons.jsx", entrySource],
    ["iconsMore.jsx", moreSource],
  ])("%s keeps both notices", (_file, source) => {
    const header = source.slice(0, source.indexOf("export "));
    expect(header).toContain("ISC License");
    expect(header).toMatch(/Permission to use, copy, modify, and\/or distribute this software for any/);
    expect(header).toContain("Copyright (c) 2013-present Cole Bemis");
    expect(header).toMatch(/Permission is hereby granted, free of charge, to any person obtaining a copy/);
  });

  it("icons.jsx carries the written size and stroke rules and the reason for the split", () => {
    const header = entrySource.slice(0, entrySource.indexOf("export function Icon"));
    expect(header).toMatch(/Sizes: 16 inline with text, 20 buttons/);
    expect(header).toMatch(/--icon-stroke/);
    expect(header).toMatch(/aria-hidden/);
    expect(header).toMatch(/built\s+\/\/ into the entry chunk whole/);
  });

  it("each file names the Feather-derived icons it contains", () => {
    expect(/derived from the Feather project \(([^)]*)\)/.exec(entrySource)?.[1]).toBe("arrow-right, check, chevron-down");
    expect(/derived from the Feather project \(([^)]*)\)/.exec(moreSource)?.[1]).toBe("lock, hash, trash-2");
  });

  it("adds no icon library or other dependency: package.json lists no lucide or icon package", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((name) => /lucide|tabler|react-icons|heroicons|fontawesome|feather/i.test(name))).toEqual([]);
  });
});

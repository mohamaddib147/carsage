// Icons: one consistent set for the whole app (design pass 2, CAR-76). These are Lucide icons copied here as plain SVG
// (version 1.61.0, copied 2026-10-22); there is no npm dependency, and "lucide-react" is not used.
//
// The set is split across two files only so the entry chunk stays small. A module shared by the entry chunk and a lazy chunk is built
// into the entry chunk whole, so this file holds just the shared <Icon> wrapper and the four icons the entry chunk needs (the header, the
// Landing hero, Log In and Sign Up): ArrowRight, Check, ChevronDown and Sparkle. Every other icon is in iconsMore.jsx, which only route
// chunks and the lazy Landing sections import. Do not import iconsMore.jsx from the header, the Landing hero or the auth pages.
//
// RULES
//  - Sizes: 16 inline with text, 20 buttons, menu rows and tiles (the default), 24 feature cards, 32 only the hero and empty states.
//  - Stroke: one token, --icon-stroke (1.75, set in index.css, applied by the .icon class). Round caps and joins. Colour is currentColor.
//  - A decorative icon is aria-hidden and not focusable (the default). An icon that carries meaning is given a `title`, which makes it
//    role="img" with that text as its label. An icon-only button always needs its own accessible name (aria-label on the button).
//  - Pass a tile or text colour with CSS, never inline. Rotate with the .icon--turn class.
//
// LICENCE NOTICES (both must stay in this file)
//
// Lucide is licensed under the ISC licence:
//
//   ISC License
//
//   Copyright (c) 2026 Lucide Icons and Contributors
//
//   Permission to use, copy, modify, and/or distribute this software for any
//   purpose with or without fee is hereby granted, provided that the above
//   copyright notice and this permission notice appear in all copies.
//
//   THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
//   WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
//   MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
//   ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
//   WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
//   ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
//   OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
//
// The following icons used in this file are derived from the Feather project (arrow-right, check, chevron-down) and carry its MIT licence:
//
//   Copyright (c) 2013-present Cole Bemis
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.

/**
 * The shared <svg> wrapper for every icon in icons.jsx and iconsMore.jsx.
 * @param {{ size?: number, title?: string, className?: string, children: import('react').ReactNode }} props
 *   size: width and height in px (default 20); title: makes the icon meaningful (role="img" and its label), omit it for a decorative icon.
 * @returns {JSX.Element}
 */
export function Icon({ size = 20, title, className = "", children, ...rest }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (props) => (
  <Icon {...props}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Icon>
);

export const Check = (props) => (
  <Icon {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const ChevronDown = (props) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const Sparkle = (props) => (
  <Icon {...props}>
    <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
  </Icon>
);

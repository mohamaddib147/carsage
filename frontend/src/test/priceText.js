// Test helper (CAR-54): finds a rendered price by its full text. A price is drawn
// as a bold primary figure plus a muted secondary one in separate elements
// (components/Price.jsx), so getByText("$6.35 (569,696 LBP)") can't match it. Use
// screen.getByText(priceText("$6.35 (569,696 LBP)")) instead.

/**
 * @param {string} text - the whole price as it reads, e.g. "$6.35 (569,696 LBP)".
 * @returns {(content: string, node: Element | null) => boolean} a getByText matcher.
 */
export function priceText(text) {
  return (_content, node) => Boolean(node?.classList?.contains("price")) && node.textContent === text;
}

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

/**
 * Structural guard (CAR-54 bug fix): finds money written on screen OUTSIDE a <Price>.
 * Every amount must be drawn by components/Price.jsx, because that is the only thing that
 * reads the USD | LBP preference. A price formatted some other way ("$5.29", "474,188 LBP")
 * would look right in a review but ignore the switch — the "separate or stale formatting
 * logic" the bug report suspected. Returns the offending text (empty when clean).
 * @param {Element} root
 * @returns {string[]}
 */
export function unconvertedMoney(root) {
  const found = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest(".price")) continue;
    const hits = node.textContent.match(/\$\s?\d[\d,.]*|\d[\d,.]*\s?LBP/g);
    if (hits) found.push(...hits.map((hit) => `${hit}  (in "${node.textContent.trim().slice(0, 70)}")`));
  }
  return found;
}

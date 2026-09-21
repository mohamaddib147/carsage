// Shows one price in BOTH currencies, with the user's chosen primary currency
// bold and first (CAR-54): "$30.00 (2,691,000 LBP)" when USD is primary,
// "2,691,000 LBP ($30.00)" when LBP is. Every price in the app is rendered
// through this, so the toggle changes them all together and the conversion rate
// is only ever applied here (lib/currency.js).

import { useCurrency } from "../currency/CurrencyContext.jsx";
import { convertAmount, formatMoney, otherCurrency } from "../lib/currency.js";

/**
 * @param {{
 *   amount: number,
 *   currency: "USD" | "LBP",
 *   suffix?: string,
 * }} props
 *   amount   - the price, in `currency` (the currency it was quoted or typed in).
 *   currency - which currency `amount` is in; the other one is converted at the fixed rate.
 *   suffix   - text after each figure, e.g. "/L" for a price per liter.
 * @returns {JSX.Element}
 */
function Price({ amount, currency, suffix = "" }) {
  const { currency: primary } = useCurrency();
  const secondary = otherCurrency(primary);

  return (
    <span className="price" data-primary={primary}>
      <strong className="price__primary">
        {formatMoney(convertAmount(amount, currency, primary), primary)}
        {suffix}
      </strong>{" "}
      <span className="price__secondary">
        ({formatMoney(convertAmount(amount, currency, secondary), secondary)}
        {suffix})
      </span>
    </span>
  );
}

export default Price;

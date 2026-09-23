// The header's "USD | LBP" switch (CAR-54): chooses which currency every price in
// the app shows first. A two-button group; the pressed one is the primary
// currency. The choice is remembered by CurrencyContext.

import { useCurrency } from "../currency/CurrencyContext.jsx";
import { CURRENCIES } from "../lib/currency.js";

/**
 * @returns {JSX.Element}
 */
function CurrencyToggle() {
  const { currency, setCurrency } = useCurrency();

  return (
    <div role="group" aria-label="Show prices in" className="currency-toggle">
      {CURRENCIES.map((code) => (
        <button
          key={code}
          type="button"
          className={`currency-toggle__option${currency === code ? " currency-toggle__option--active" : ""}`}
          aria-pressed={currency === code}
          onClick={() => setCurrency(code)}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

export default CurrencyToggle;

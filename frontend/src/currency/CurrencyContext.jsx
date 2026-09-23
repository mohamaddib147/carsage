// Holds which currency (USD or LBP) is shown as the primary figure across the app
// (CAR-54). The choice is a frontend-only preference: it starts from what was
// saved in localStorage on the last visit and is saved again whenever it changes.
// Wrap the app in <CurrencyProvider> (main.jsx) and read it with useCurrency().

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { isCurrency, readStoredCurrency, storeCurrency } from "../lib/currency.js";

// No default value on purpose: a component rendered without a <CurrencyProvider> above
// it must FAIL LOUDLY (see useCurrency). A silent fallback made the header switch look
// like it worked while changing nothing, which is exactly the bug this replaced.
const CurrencyContext = createContext(undefined);

/**
 * Provides the primary currency and a way to change it.
 * @param {{ children: import('react').ReactNode }} props
 * @returns {JSX.Element}
 */
export function CurrencyProvider({ children }) {
  // A function, so localStorage is read once at start-up rather than every render.
  const [currency, setCurrencyState] = useState(readStoredCurrency);

  /** Switches the primary currency and remembers it. Anything but USD/LBP is ignored. */
  const setCurrency = useCallback((next) => {
    if (!isCurrency(next)) return;
    setCurrencyState(next);
    storeCurrency(next);
  }, []);

  const value = useMemo(() => ({ currency, setCurrency }), [currency, setCurrency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/**
 * The current primary currency and its setter. Must be used within a <CurrencyProvider>
 * (main.jsx), like useAuth within an AuthProvider.
 * @returns {{ currency: "USD" | "LBP", setCurrency: (next: "USD" | "LBP") => void }}
 */
export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}

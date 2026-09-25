// Application entry point — mounts the React tree into #root and wraps
// the app in a BrowserRouter so all pages get client-side routing, the
// AuthProvider (login state), the CurrencyProvider (USD/LBP preference,
// CAR-54), and the ActiveCarProvider (car-brand site theming, CAR-55).

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { CurrencyProvider } from "./currency/CurrencyContext.jsx";
import { ActiveCarProvider } from "./theme/ActiveCarContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CurrencyProvider>
          <ActiveCarProvider>
            <App />
          </ActiveCarProvider>
        </CurrencyProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

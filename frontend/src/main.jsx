// Application entry point — mounts the React tree into #root and wraps
// the app in a BrowserRouter so all pages get client-side routing, the
// AuthProvider (login state), the CurrencyProvider (USD/LBP preference,
// CAR-54), and the ActiveCarProvider (car-brand site theming, CAR-55).

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./fonts.css";
import "./index.css";
import "./tailwind.css";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { CurrencyProvider } from "./currency/CurrencyContext.jsx";
import { ActiveCarProvider } from "./theme/ActiveCarContext.jsx";
import { installChunkReloadGuard } from "./lib/chunkReload.js";

// After a new deploy, a tab opened before it can't download the old hashed
// chunks; reload once to pick up the new version (see lib/chunkReload.js).
installChunkReloadGuard();

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

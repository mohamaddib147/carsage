// Root component — defines client-side routing for all CarSage screens (the 7
// original ones plus the Fuel Log, CAR-53) and the placeholder Terms / Privacy
// pages linked from the footer.

import { Route, Routes } from "react-router-dom";
import backgroundTexture from "./assets/background-texture-icon.svg";
import SiteFooter from "./components/SiteFooter.jsx";
import SiteNav from "./components/SiteNav.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import CarOnboardingPage from "./pages/CarOnboardingPage.jsx";
import CarProfilePage from "./pages/CarProfilePage.jsx";
import TripPlannerPage from "./pages/TripPlannerPage.jsx";
import AIAdvisorPage from "./pages/AIAdvisorPage.jsx";
import FuelLogPage from "./pages/FuelLogPage.jsx";
import { PrivacyPage, TermsPage } from "./pages/LegalPages.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

/**
 * Application root: renders the nav and the route table.
 * @returns {JSX.Element}
 */
function App() {
  return (
    <>
      {/* Decorative only, never a second brand mark (CAR-51 follow-up):
          fixed to fill the viewport so it shows on every screen without
          each page having to place it. background-texture-icon.svg is a
          crop of background-texture-svg.svg down to just the gear/tire/
          wrench circle — no baked-in text, unlike the source file. aria-
          hidden + empty alt keep it invisible to assistive tech; low
          opacity and z-index: -1 keep it behind all real content. */}
      <img
        src={backgroundTexture}
        alt=""
        aria-hidden="true"
        className="app-background-texture"
      />
      <SiteNav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/signup" element={<AuthPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cars/new"
            element={
              <ProtectedRoute>
                <CarOnboardingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cars/mine"
            element={
              <ProtectedRoute>
                <CarProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cars/:carId"
            element={
              <ProtectedRoute>
                <CarProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trip-planner"
            element={
              <ProtectedRoute>
                <TripPlannerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/advisor"
            element={
              <ProtectedRoute>
                <AIAdvisorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fuel-log"
            element={
              <ProtectedRoute>
                <FuelLogPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        {/* CAR-52: rendered once here (not per page) so Terms of Service /
            Privacy Policy are linked from every screen's footer. */}
        <SiteFooter />
      </main>
    </>
  );
}

export default App;

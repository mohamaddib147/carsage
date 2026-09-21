// Root component — defines client-side routing for all CarSage screens (the 7
// original ones plus the Fuel Log, CAR-53) and the placeholder Terms / Privacy
// pages linked from the footer.

import { Route, Routes } from "react-router-dom";
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
      </main>
    </>
  );
}

export default App;

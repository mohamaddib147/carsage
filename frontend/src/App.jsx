// Root component — defines client-side routing for all CarSage screens (the 7
// original ones plus the Fuel Log, CAR-53, Maintenance, CAR-62, and Expenses, CAR-64) and the
// placeholder Terms / Privacy pages linked from the footer.
//
// CAR-67: every screen except Landing and Log In / Sign Up is loaded on
// demand (React.lazy), so a first visit downloads only the screen it opens.
// Landing and Auth stay in the entry bundle because they are the two most
// common first screens. Recharts, the largest dependency, is imported only
// by Fuel Log and Expenses, so it now ships only with those two screens.

import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import backgroundTexture from "./assets/background-texture-icon.svg";
import ColdStartBanner from "./components/ColdStartBanner.jsx";
import RouteLoading from "./components/RouteLoading.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import SiteNav from "./components/SiteNav.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";

const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage.jsx"));
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const CarOnboardingPage = lazy(() => import("./pages/CarOnboardingPage.jsx"));
const CarProfilePage = lazy(() => import("./pages/CarProfilePage.jsx"));
const TripPlannerPage = lazy(() => import("./pages/TripPlannerPage.jsx"));
const AIAdvisorPage = lazy(() => import("./pages/AIAdvisorPage.jsx"));
const FuelLogPage = lazy(() => import("./pages/FuelLogPage.jsx"));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage.jsx"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage.jsx"));
// LegalPages.jsx has two named exports; both share one chunk.
const PrivacyPage = lazy(() => import("./pages/LegalPages.jsx").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("./pages/LegalPages.jsx").then((m) => ({ default: m.TermsPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage.jsx"));

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
      <ColdStartBanner />
      <main className="app-main">
        {/* One boundary for all lazy screens: the skeleton stands in for
            the page while its chunk downloads; nav and footer stay put. */}
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/signup" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
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
            <Route
              path="/maintenance"
              element={
                <ProtectedRoute>
                  <MaintenancePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <ExpensesPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        {/* CAR-52: rendered once here (not per page) so Terms of Service /
            Privacy Policy are linked from every screen's footer. */}
        <SiteFooter />
      </main>
    </>
  );
}

export default App;

// Root component — defines client-side routing for all 7 CarSage screens.

import { Route, Routes } from "react-router-dom";
import SiteNav from "./components/SiteNav.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import CarOnboardingPage from "./pages/CarOnboardingPage.jsx";
import CarProfilePage from "./pages/CarProfilePage.jsx";
import TripPlannerPage from "./pages/TripPlannerPage.jsx";
import AIAdvisorPage from "./pages/AIAdvisorPage.jsx";
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
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/cars/new" element={<CarOnboardingPage />} />
          <Route path="/cars/:carId" element={<CarProfilePage />} />
          <Route path="/trip-planner" element={<TripPlannerPage />} />
          <Route path="/advisor" element={<AIAdvisorPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </>
  );
}

export default App;

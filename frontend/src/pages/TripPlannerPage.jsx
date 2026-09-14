// Trip Planner screen (core feature) — destination in, estimated fuel
// cost + traffic-adjusted travel time out. No map UI, no route modifiers.

import PageShell from "../components/PageShell.jsx";

/**
 * Placeholder for the Trip Planner screen.
 * @returns {JSX.Element}
 */
function TripPlannerPage() {
  return (
    <PageShell
      title="Trip Planner"
      description="Enter a destination to get estimated fuel cost and travel time."
    />
  );
}

export default TripPlannerPage;

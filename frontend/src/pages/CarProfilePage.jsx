// Car Profile screen — view and edit the saved specs for one car,
// identified by its id in the route.

import { useParams } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";

/**
 * Placeholder for the Car Profile screen.
 * @returns {JSX.Element}
 */
function CarProfilePage() {
  const { carId } = useParams();

  return (
    <PageShell
      title="Car Profile"
      description={`View and edit specs for car "${carId}".`}
    />
  );
}

export default CarProfilePage;

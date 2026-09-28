// A site-wide banner that appears while a backend request is taking long
// enough to likely be Render's free-tier cold start waking the service
// back up (lib/coldStart.js), instead of the page just looking stuck.
// Mounted once in App.jsx so it works regardless of which page/request
// triggers it.

import { useEffect, useState } from "react";
import { onColdStartChange } from "../lib/coldStart.js";

/**
 * Shows a friendly "waking up the server" message while lib/coldStart.js
 * reports a slow request in flight; renders nothing otherwise.
 * @returns {JSX.Element | null}
 */
function ColdStartBanner() {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => onColdStartChange(setIsSlow), []);

  if (!isSlow) return null;

  return (
    <div className="cold-start-banner" role="status">
      <span className="cold-start-banner__spinner" aria-hidden="true" />
      Waking up the server, this can take up to a minute on the first
      request after a while. Thanks for your patience.
    </div>
  );
}

export default ColdStartBanner;

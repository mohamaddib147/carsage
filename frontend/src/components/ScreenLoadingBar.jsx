// A thin bar across the top of the window shown while a slow screen loads
// (CAR-67 follow-up). The bar itself is decorative (aria-hidden); assistive
// tech gets a polite "Loading page..." status, and App.jsx also marks <main>
// aria-busy while it is shown. Under prefers-reduced-motion the bar is still
// shown but doesn't slide (see index.css).

/**
 * @param {{ active: boolean }} props whether a slow screen load is in progress
 * @returns {JSX.Element | null}
 */
function ScreenLoadingBar({ active }) {
  if (!active) return null;
  return (
    <>
      <div className="screen-loading-bar" aria-hidden="true">
        <div className="screen-loading-bar__fill" />
      </div>
      <p role="status" className="sr-only">Loading page...</p>
    </>
  );
}

export default ScreenLoadingBar;

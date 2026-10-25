// Fallback shown while a lazily loaded screen's code downloads (CAR-67).
// Page-shaped (a title bar and a content card) so the layout doesn't jump
// when the real screen arrives, built from the shared .skeleton-* classes
// in index.css, never a blank screen.

/**
 * A page-shaped loading skeleton for <Suspense>. The bars are hidden from
 * assistive tech; a visually hidden status line is what's announced.
 * @returns {JSX.Element}
 */
function RouteLoading() {
  return (
    <section className="page-shell route-loading">
      <p role="status" className="sr-only">Loading...</p>
      <div className="skeleton-stack" aria-hidden="true">
        <div className="skeleton-bar skeleton-bar--w-40 skeleton-bar--h-lg" />
        <div className="skeleton-bar skeleton-bar--w-70 skeleton-bar--h-sm" />
        <div className="skeleton-bar skeleton-bar--card" />
      </div>
    </section>
  );
}

export default RouteLoading;

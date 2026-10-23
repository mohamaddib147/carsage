// Error boundary around the lazily loaded screens (CAR-67 follow-up). If a
// screen's code fails to download (typically: a new version was deployed while
// the tab was open, or the connection dropped) or the screen crashes while
// rendering, the visitor sees a clear message and a Reload button instead of a
// blank page. The header and footer stay put because the boundary only wraps
// the route table.
//
// It forgets the error when `resetKey` changes (App passes the current path),
// so tapping a link to another screen works without a reload. React.lazy keeps
// a failed import's error for good, so reopening the *same* broken screen needs
// the Reload button.

import { Component } from "react";
import { isChunkLoadError } from "../lib/chunkReload.js";

export default class ScreenErrorBoundary extends Component {
  state = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error) {
    return { error };
  }

  // Runs on every render: a new resetKey (a different path) clears the error.
  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error) {
    // Keep it in the console for debugging; the visitor sees the message below.
    console.error("Screen failed to load:", error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const reload = this.props.onReload ?? (() => window.location.reload());
    const downloadFailed = isChunkLoadError(error);
    return (
      <section className="page-shell screen-error" role="alert">
        <h1>{downloadFailed ? "This page could not load" : "Something went wrong"}</h1>
        <p className="page-shell__description">
          {downloadFailed
            ? "CarSage may have just been updated, or your connection dropped. Reload to get the latest version."
            : "This page hit a problem. Reloading usually fixes it."}
        </p>
        <button type="button" className="btn-primary" onClick={reload}>
          Reload
        </button>
      </section>
    );
  }
}

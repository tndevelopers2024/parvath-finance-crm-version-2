import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";
// Keeps a render-time crash inside the page area so the sidebar stays usable.
// `resetKey` should change with the route; moving elsewhere clears the error.
export default class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("Page crashed", error, info.componentStack);
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey)
      this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-state" role="alert">
        <h2>Something went wrong on this page</h2>
        <p>Reload the page to try again, or go back to the dashboard.</p>
        <div className="modal-actions">
          <button className="primary" onClick={() => window.location.reload()}>
            Reload this page
          </button>
          <Link className="button" to="/dashboard">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }
}

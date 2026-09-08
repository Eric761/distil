import * as React from "react";

interface Props {
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Top-level React error boundary: catches render-time exceptions anywhere in the
 * tree (a safety net alongside React Router's per-route `errorElement`) so a
 * component bug shows a recoverable message instead of a blank white screen.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" className="mx-auto max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The interface hit an unexpected error. Your saved data is safe — reload to continue.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-muted"
              onClick={this.reset}
            >
              Try again
            </button>
            <button
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

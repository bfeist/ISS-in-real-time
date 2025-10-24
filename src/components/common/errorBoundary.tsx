import { Component, ErrorInfo, ReactNode } from "react";
import styles from "./errorBoundary.module.css";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true, error: null, errorInfo: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the error details to the console for debugging while the UI shows a friendly fallback.
    console.error("Unexpected render error captured by ErrorBoundary", error, info);
    this.setState({ error, errorInfo: info });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;

    if (hasError) {
      const detailsText = [
        error ? `${error.name}: ${error.message}` : null,
        errorInfo?.componentStack ?? null,
      ]
        .filter(Boolean)
        .join("\n");

      return (
        <main className={styles.container}>
          <div className={styles.content}>
            <h1 className={styles.title}>An Unexpected Error Occurred</h1>
            <p className={styles.description}>
              <span>
                Something went wrong while rendering this page. Please try reloading the app.
              </span>
              <span>
                If this keeps happening, please let us know what you were doing when you encountered
                the error and we&apos;ll take a look.
              </span>
            </p>
            <button type="button" onClick={this.handleReload} className={styles.reloadButton}>
              Reload page
            </button>
            {(error || errorInfo) && (
              <details className={styles.details}>
                <summary className={styles.summary}>Error details</summary>
                <pre className={styles.stackTrace}>{detailsText}</pre>
              </details>
            )}
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

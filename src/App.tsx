import { Outlet, useLocation } from "react-router-dom";
import "./styles/global.css";
import { JSX, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./utils/cacheManagement"; // Initialize global cache utils
import { initGA, trackPageView } from "./utils/analytics";
import ErrorBoundary from "./components/common/errorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes for general data
    },
  },
});

// Initialize Google Analytics once
initGA();

// Test component for error boundary - defined outside render
const ErrorTesterComponent = ({ shouldError }: { shouldError: boolean }): JSX.Element | null => {
  if (shouldError) {
    throw new Error("This is a test error to trigger the error boundary!");
  }
  return null;
};

function App(): JSX.Element {
  const location = useLocation();

  // Track page views on route changes
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);

  return (
    <ErrorBoundary>
      <ErrorTesterComponent shouldError={false} />
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

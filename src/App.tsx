import { Outlet } from "react-router-dom";
import "./styles/global.css";
import { JSX } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./utils/cacheManagement"; // Initialize global cache utils

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes for general data
    },
  },
});

function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Add shared layout components like header, footer, etc. */}
      <Outlet />
    </QueryClientProvider>
  );
}

export default App;

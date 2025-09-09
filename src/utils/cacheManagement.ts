import { QueryClient } from "@tanstack/react-query";

// Maximum number of dates to keep cached - increased to reduce aggressive cleanup
const MAX_CACHED_DATES = 2;

// Track visited dates in order
let visitedDates: string[] = [];

/**
 * Manages cache for date-specific queries by removing old entries
 * when the cache grows too large
 */
export function manageDateCache(queryClient: QueryClient, currentDate: string): void {
  // Add current date to visited list if not already present
  if (!visitedDates.includes(currentDate)) {
    visitedDates.push(currentDate);
  }

  // If we exceed max cached dates, remove the oldest ones
  if (visitedDates.length > MAX_CACHED_DATES) {
    const datesToRemove = visitedDates.splice(0, visitedDates.length - MAX_CACHED_DATES);

    datesToRemove.forEach((date) => {
      // Remove all date-specific queries for this date
      queryClient.removeQueries({
        predicate: (query) => {
          const queryKey = query.queryKey;
          return (
            Array.isArray(queryKey) &&
            queryKey.length >= 2 &&
            queryKey[1] === date &&
            [
              "dataAvailability",
              "commTranscript",
              "ephemera",
              "earthPhotography",
              "activitySummary",
              "blogArticles",
            ].includes(queryKey[0] as string)
          );
        },
      });
    });

    if (import.meta.env.DEV) {
      const stats = getCacheStats(queryClient);
      console.log("📊 Cache stats after cleanup:", stats);
    }
  }
}

/**
 * Clears all date-specific cached data
 */
export function clearDateCache(queryClient: QueryClient): void {
  visitedDates = [];
  queryClient.removeQueries({
    predicate: (query) => {
      const queryKey = query.queryKey;
      return (
        Array.isArray(queryKey) &&
        queryKey.length >= 2 &&
        [
          "dataAvailability",
          "commTranscript",
          "ephemera",
          "earthPhotography",
          "activitySummary",
          "blogArticles",
        ].includes(queryKey[0] as string)
      );
    },
  });
}

/**
 * Gets current cache statistics for debugging
 */
export function getCacheStats(queryClient: QueryClient): {
  totalQueries: number;
  dateSpecificQueries: number;
  visitedDates: number;
  cachedDates: number;
} {
  const cache = queryClient.getQueryCache();
  const dateQueries = cache.getAll().filter((query) => {
    const queryKey = query.queryKey;
    return (
      Array.isArray(queryKey) &&
      queryKey.length >= 2 &&
      [
        "dataAvailability",
        "commTranscript",
        "ephemera",
        "earthPhotography",
        "activitySummary",
        "blogArticles",
      ].includes(queryKey[0] as string)
    );
  });

  return {
    totalQueries: cache.getAll().length,
    dateSpecificQueries: dateQueries.length,
    visitedDates: visitedDates.length,
    cachedDates: [...new Set(dateQueries.map((q) => q.queryKey[1]))].length,
  };
}

/**
 * Console utility functions for manual cache inspection
 * Available in development mode via window object
 */
export function logCacheStats(queryClient: QueryClient): void {
  const stats = getCacheStats(queryClient);
  console.table(stats);
}

export function logAllQueries(queryClient: QueryClient): void {
  const cache = queryClient.getQueryCache();
  const queries = cache.getAll().map((query) => ({
    queryKey: query.queryKey,
    state: query.state.status,
  }));
  console.table(queries);
}

// Make utilities available globally in development
if (import.meta.env.DEV && typeof window !== "undefined") {
  const win = window as { cacheUtils?: unknown };
  win.cacheUtils = {
    logStats: (queryClient: QueryClient) => logCacheStats(queryClient),
    logQueries: (queryClient: QueryClient) => logAllQueries(queryClient),
    clearDateCache: (queryClient: QueryClient) => clearDateCache(queryClient),
  };
}

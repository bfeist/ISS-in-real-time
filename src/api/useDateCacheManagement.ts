import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { manageDateCache } from "../utils/cacheManagement";

/**
 * Hook that automatically manages cache when selectedDate changes
 */
export function useDateCacheManagement(selectedDate: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (selectedDate) {
      // if (import.meta.env.DEV) {
      //   console.log(`📅 Date changed to: ${selectedDate}`);
      //   const statsBefore = getCacheStats(queryClient);
      //   console.log("📊 Cache stats before:", statsBefore);
      // }

      manageDateCache(queryClient, selectedDate);

      // if (import.meta.env.DEV) {
      //   const statsAfter = getCacheStats(queryClient);
      //   console.log("📊 Cache stats after:", statsAfter);
      // }
    }
  }, [selectedDate, queryClient]);
}

import { StateCreator } from "zustand";
import { getNextDay, hhmmssFromAppSeconds } from "../../utils/dateTime";
import { createDateTimeSlug } from "../../utils/params";
import type { AppStore, ClockSlice, DateSelectionOptions } from "../types";

export const createClockSlice: StateCreator<AppStore, [], [], ClockSlice> = (set, get, _store) => ({
  clock: {
    startStopTimestamp: new Date().toISOString(),
    appSecondsAtStartStop: 0,
    isRunning: false,
    selectedDate: null,
    startClock: () =>
      set((state) => ({
        clock: {
          ...state.clock,
          startStopTimestamp: new Date().toISOString(),
          isRunning: true,
        },
      })),
    stopClock: () =>
      set((state) => {
        const elapsedSeconds = Math.floor(
          state.clock.appSecondsAtStartStop +
            (Date.now() - Date.parse(state.clock.startStopTimestamp)) / 1000
        );

        return {
          clock: {
            ...state.clock,
            startStopTimestamp: new Date().toISOString(),
            appSecondsAtStartStop: elapsedSeconds,
            isRunning: false,
          },
        };
      }),
    setTimeOnly: (seconds: number, _options?: DateSelectionOptions) =>
      set((state) => ({
        clock: {
          ...state.clock,
          appSecondsAtStartStop: seconds,
          startStopTimestamp: new Date().toISOString(),
        },
      })),
    setDateOnly: (date: string | null, options?: DateSelectionOptions) => {
      set((state) => ({
        clock: {
          ...state.clock,
          selectedDate: date,
        },
      }));

      const {
        clock: { appSecondsAtStartStop },
      } = get();

      syncUrl(date, appSecondsAtStartStop, options?.includeTimeInUrl ?? false);
    },
    setDateTime: (date: string | null, seconds: number | null, options?: DateSelectionOptions) => {
      set((state) => ({
        clock: {
          ...state.clock,
          ...(date !== undefined ? { selectedDate: date } : {}),
          ...(typeof seconds === "number"
            ? {
                appSecondsAtStartStop: seconds,
                startStopTimestamp: new Date().toISOString(),
              }
            : {}),
        },
      }));

      const {
        clock: { appSecondsAtStartStop, selectedDate },
      } = get();

      const resolvedDate = date !== undefined ? date : selectedDate;
      const resolvedSeconds =
        typeof seconds === "number" ? seconds : (appSecondsAtStartStop ?? null);

      syncUrl(resolvedDate ?? null, resolvedSeconds ?? null, options?.includeTimeInUrl ?? false);
    },
    handleDayRollover: () =>
      set((state) => {
        const currentDate = state.clock.selectedDate;
        if (!currentDate) {
          return state;
        }

        const today = new Date().toISOString().split("T")[0];
        if (currentDate === today) {
          queueMicrotask(() => {
            syncUrl(currentDate, 86399, false);
          });

          return {
            clock: {
              ...state.clock,
              appSecondsAtStartStop: 86399,
              startStopTimestamp: new Date().toISOString(),
            },
          };
        }

        const nextDay = getNextDay(currentDate);
        queueMicrotask(() => {
          syncUrl(nextDay, 0, false);
        });

        return {
          clock: {
            ...state.clock,
            selectedDate: nextDay,
            appSecondsAtStartStop: 0,
            startStopTimestamp: new Date().toISOString(),
          },
        };
      }),
  },
});

/**
 * Keeps the browser URL aligned with the current date/time selection without triggering a reload.
 * Uses a date-only slug by default, but can include the time component when requested.
 */
const syncUrl = (date: string | null, seconds: number | null, includeTimeInUrl: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  const { pathname, search, hash } = window.location;
  let targetPath = "/";

  if (date) {
    if (includeTimeInUrl && seconds !== null && seconds >= 0 && seconds < 86400) {
      try {
        const timeStr = hhmmssFromAppSeconds(seconds);
        targetPath = `/${createDateTimeSlug(date, timeStr)}`;
      } catch {
        targetPath = `/${date}`;
      }
    } else {
      targetPath = `/${date}`;
    }
  }

  const currentUrl = `${pathname}${search}${hash}`;
  const nextUrl = `${targetPath}${search}${hash}`;

  if (currentUrl !== nextUrl) {
    window.history.replaceState(window.history.state, "", nextUrl);
  }
};

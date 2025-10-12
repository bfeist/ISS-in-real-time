import { StateCreator } from "zustand";
import { getNextDay } from "../../utils/dates";
import { hhmmssFromAppSeconds } from "../../utils/time";
import { createDateTimeSlug } from "../../utils/params";

/** Options controlling URL update behaviour when adjusting clock selections. */
type SelectionOptions = {
  includeTimeInUrl?: boolean;
};

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

export const createStateClock: StateCreator<AppState, [], [], ClockState> = (set, get) => ({
  // Clock initial state
  startStopTimestamp: new Date().toISOString(),
  appSecondsAtStartStop: 0,
  isRunning: false,

  // Selected date initial state
  selectedDate: null,

  // Actions
  /** Marks the clock as running from the current moment. */
  startClock: () =>
    set(() => ({
      startStopTimestamp: new Date().toISOString(),
      isRunning: true,
    })),

  /** Stops the clock and persists the elapsed app seconds. */
  stopClock: () =>
    set((state: AppState) => {
      const appSeconds = Math.floor(
        state.appSecondsAtStartStop + (Date.now() - Date.parse(state.startStopTimestamp)) / 1000
      );

      const nextState = {
        startStopTimestamp: new Date().toISOString(),
        appSecondsAtStartStop: appSeconds,
        isRunning: false,
      };

      return nextState;
    }),

  /** Sets only the time portion of the selection, leaving the date untouched. */
  setTimeOnly: (seconds: number, _options?: SelectionOptions) => {
    set(() => ({
      appSecondsAtStartStop: seconds,
      startStopTimestamp: new Date().toISOString(),
    }));
  },

  /** Sets only the date portion of the selection, optionally syncing the URL. */
  setDateOnly: (date: string | null, options?: SelectionOptions) => {
    set({ selectedDate: date });

    const { appSecondsAtStartStop } = get();
    syncUrl(date, appSecondsAtStartStop, options?.includeTimeInUrl ?? false);
  },

  /** Convenience helper for updating both date and time simultaneously. */
  setDateTime: (date: string | null, seconds: number | null, options?: SelectionOptions) => {
    set(() => ({
      ...(date !== undefined ? { selectedDate: date } : {}),
      ...(typeof seconds === "number"
        ? {
            appSecondsAtStartStop: seconds,
            startStopTimestamp: new Date().toISOString(),
          }
        : {}),
    }));

    const { appSecondsAtStartStop, selectedDate } = get();
    const resolvedDate = date !== undefined ? date : selectedDate;
    const resolvedSeconds = typeof seconds === "number" ? seconds : (appSecondsAtStartStop ?? null);

    syncUrl(resolvedDate ?? null, resolvedSeconds ?? null, options?.includeTimeInUrl ?? false);
  },

  /** Handles rolling over to the next day when the clock surpasses 24 hours. */
  handleDayRollover: () =>
    set((state) => {
      const currentDate = state.selectedDate;
      if (!currentDate) return state;

      // Don't roll over if we're already on today's date (current day)
      const today = new Date().toISOString().split("T")[0];
      if (currentDate === today) {
        // If we're on today and hit 24 hours, just stop the clock at 23:59:59
        queueMicrotask(() => {
          syncUrl(currentDate, 86399, false);
        });

        return {
          appSecondsAtStartStop: 86399, // 23:59:59
          startStopTimestamp: new Date().toISOString(),
        };
      }

      // Roll over to the next day for historical dates
      const nextDay = getNextDay(currentDate);
      queueMicrotask(() => {
        syncUrl(nextDay, 0, false);
      });

      return {
        selectedDate: nextDay,
        appSecondsAtStartStop: 0,
        startStopTimestamp: new Date().toISOString(),
      };
    }),
});

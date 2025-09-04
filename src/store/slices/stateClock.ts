import { StateCreator } from "zustand";
import { getNextDay } from "../../utils/dates";

export const createStateClock: StateCreator<AppState, [], [], ClockState> = (set) => ({
  // Clock initial state
  startStopTimestamp: new Date().toISOString(),
  appSecondsAtStartStop: 0,
  isRunning: false,

  // Selected date initial state
  selectedDate: null,

  // Actions
  startClock: () =>
    set(() => ({
      startStopTimestamp: new Date().toISOString(),
      isRunning: true,
    })),

  stopClock: () =>
    set((state: AppState) => {
      const appSeconds = Math.floor(
        state.appSecondsAtStartStop + (Date.now() - Date.parse(state.startStopTimestamp)) / 1000
      );
      return {
        startStopTimestamp: new Date().toISOString(),
        appSecondsAtStartStop: appSeconds,
        isRunning: false,
      };
    }),

  setClock: (seconds: number) =>
    set(() => ({
      appSecondsAtStartStop: seconds,
      startStopTimestamp: new Date().toISOString(),
    })),

  // Selected date actions
  setSelectedDate: (date: string | null) => set({ selectedDate: date }),

  handleDayRollover: () =>
    set((state) => {
      const currentDate = state.selectedDate;
      if (!currentDate) return state;

      // Don't roll over if we're already on today's date (current day)
      const today = new Date().toISOString().split("T")[0];
      if (currentDate === today) {
        // If we're on today and hit 24 hours, just stop the clock at 23:59:59
        return {
          appSecondsAtStartStop: 86399, // 23:59:59
          startStopTimestamp: new Date().toISOString(),
        };
      }

      // Roll over to the next day for historical dates
      const nextDay = getNextDay(currentDate);
      return {
        selectedDate: nextDay,
        appSecondsAtStartStop: 0,
        startStopTimestamp: new Date().toISOString(),
      };
    }),
});

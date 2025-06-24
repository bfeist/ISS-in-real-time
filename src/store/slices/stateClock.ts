import { StateCreator } from "zustand";

export const createStateClock: StateCreator<AppState, [], [], ClockState> = (set) => ({
  // Clock initial state
  startStopTimestamp: new Date().toISOString(),
  appSecondsAtStartStop: 0,
  isRunning: false,

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
});

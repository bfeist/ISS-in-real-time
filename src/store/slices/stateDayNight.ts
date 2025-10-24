import { StateCreator } from "zustand";

export const createStateDayNight: StateCreator<AppState, [], [], DayNightState> = (set) => ({
  // Day/Night initial state
  dayNight: [],

  // Actions
  setDayNight: (dayNight: DayNightObj[]) => set({ dayNight }),
});

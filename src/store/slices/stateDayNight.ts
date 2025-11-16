import { StateCreator } from "zustand";
import type { AppStore, DayNightSlice } from "../types";

export const createDayNightSlice: StateCreator<AppStore, [], [], DayNightSlice> = (
  set,
  _get,
  _store
) => ({
  dayNight: {
    dayNight: [],
    setDayNight: (dayNight: DayNightObj[]) =>
      set((state) => ({
        dayNight: {
          ...state.dayNight,
          dayNight,
        },
      })),
  },
});

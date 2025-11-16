import type { DayNightSlice } from "../types";
import { useAppStore } from "../index";

export const useStateDayNight = (): DayNightSlice["dayNight"] =>
  useAppStore((state) => state.dayNight);

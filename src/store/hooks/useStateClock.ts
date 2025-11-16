import type { ClockSlice } from "../types";
import { useAppStore } from "../index";

export const useStateClock = (): ClockSlice["clock"] => useAppStore((state) => state.clock);

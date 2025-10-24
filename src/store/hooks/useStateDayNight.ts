import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../index";

export const useStateDayNight = (): {
  dayNight: DayNightObj[];
  setDayNight: (dayNight: DayNightObj[]) => void;
} =>
  useAppStore(
    useShallow((state) => ({
      dayNight: state.dayNight,
      setDayNight: state.setDayNight,
    }))
  );

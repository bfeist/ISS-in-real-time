import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../index";

// Backwards compatibility hook - selectedDate is now part of useStateClock
export const useStateSelectedDate = (): {
  selectedDate: string | null;
  setSelectedDate: (date: string | null) => void;
} =>
  useAppStore(
    useShallow((state) => ({
      selectedDate: state.selectedDate,
      setSelectedDate: state.setSelectedDate,
    }))
  );

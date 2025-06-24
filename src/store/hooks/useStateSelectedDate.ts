import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../index";

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

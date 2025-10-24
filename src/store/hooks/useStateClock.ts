import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../index";

export const useStateClock = (): {
  startStopTimestamp: string;
  appSecondsAtStartStop: number;
  isRunning: boolean;
  selectedDate: string | null;
  startClock: () => void;
  stopClock: () => void;
  setTimeOnly: (seconds: number, options?: DateSelectionOptions) => void;
  setDateOnly: (date: string | null, options?: DateSelectionOptions) => void;
  setDateTime: (
    date: string | null,
    seconds: number | null,
    options?: DateSelectionOptions
  ) => void;
  handleDayRollover: () => void;
} =>
  useAppStore(
    useShallow((state) => ({
      startStopTimestamp: state.startStopTimestamp,
      appSecondsAtStartStop: state.appSecondsAtStartStop,
      isRunning: state.isRunning,
      selectedDate: state.selectedDate,
      startClock: state.startClock,
      stopClock: state.stopClock,
      setTimeOnly: state.setTimeOnly,
      setDateOnly: state.setDateOnly,
      setDateTime: state.setDateTime,
      handleDayRollover: state.handleDayRollover,
    }))
  );

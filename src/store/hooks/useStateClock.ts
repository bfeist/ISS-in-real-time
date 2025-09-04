import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../index";

export const useStateClock = (): {
  startStopTimestamp: string;
  appSecondsAtStartStop: number;
  isRunning: boolean;
  selectedDate: string | null;
  startClock: () => void;
  stopClock: () => void;
  setClock: (seconds: number) => void;
  setSelectedDate: (date: string | null) => void;
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
      setClock: state.setClock,
      setSelectedDate: state.setSelectedDate,
      handleDayRollover: state.handleDayRollover,
    }))
  );

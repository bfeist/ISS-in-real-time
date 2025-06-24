import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../index";

export const useStateClock = (): {
  startStopTimestamp: string;
  appSecondsAtStartStop: number;
  isRunning: boolean;
  startClock: () => void;
  stopClock: () => void;
  setClock: (seconds: number) => void;
} =>
  useAppStore(
    useShallow((state) => ({
      startStopTimestamp: state.startStopTimestamp,
      appSecondsAtStartStop: state.appSecondsAtStartStop,
      isRunning: state.isRunning,
      startClock: state.startClock,
      stopClock: state.stopClock,
      setClock: state.setClock,
    }))
  );

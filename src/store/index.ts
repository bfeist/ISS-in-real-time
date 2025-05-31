import { create, StateCreator } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

// Define the store creation function separately with proper types
const createStore: StateCreator<AppState> = (set) => ({
  // Clock initial state - flattened
  startStopTimestamp: new Date().toISOString(),
  appSecondsAtStartStop: 0,
  isRunning: false,

  // Clock actions
  startClock: () =>
    set(() => ({
      startStopTimestamp: new Date().toISOString(),
      isRunning: true,
    })),

  stopClock: () =>
    set((state: AppState) => {
      const appSeconds = Math.floor(
        state.appSecondsAtStartStop + (Date.now() - Date.parse(state.startStopTimestamp)) / 1000
      );
      return {
        startStopTimestamp: new Date().toISOString(),
        appSecondsAtStartStop: appSeconds,
        isRunning: false,
      };
    }),

  setClock: (seconds: number) =>
    set(() => ({
      appSecondsAtStartStop: seconds,
      startStopTimestamp: new Date().toISOString(),
    })),

  // Hover initial state
  hoverSeconds: null,

  // Hover actions
  setHoverSeconds: (seconds: number | null) => set({ hoverSeconds: seconds }),
});

// Create store with redux devtools middleware
export const useAppStore = create<AppState>()(
  devtools(createStore, { name: "ISSiRT Zustand Store" })
);

// Create selector hooks for better performance
export const useClockState = (): {
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

export const useHoverState = (): {
  hoverSeconds: number | null;
  setHoverSeconds: (seconds: number | null) => void;
} =>
  useAppStore(
    useShallow((state) => ({
      hoverSeconds: state.hoverSeconds,
      setHoverSeconds: state.setHoverSeconds,
    }))
  );

interface ClockState {
  startStopTimestamp: string;
  appSecondsAtStartStop: number;
  isRunning: boolean;

  // Actions
  startClock: () => void;
  stopClock: () => void;
  setClock: (seconds: number) => void;
}

interface HoverState {
  hoverSeconds: number | null;

  // Actions
  setHoverSeconds: (seconds: number | null) => void;
}

// Combined store type
interface AppState extends ClockState, HoverState {}

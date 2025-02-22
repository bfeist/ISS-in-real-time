// general context provider for combining multiple contexts
type Provider = ({ children }: { children: React.ReactNode }) => React.ReactElement;

interface ClockContextType {
  clock: Clock;
  setClock: React.Dispatch<React.SetStateAction<Clock>>;
}

type Clock = {
  startStopTimestamp: string; // the timestamp the play/pause button was clicked
  appSecondsAtStartStop: number; // the value of the play/pause button at the time it was clicked
  isRunning: boolean;
};

interface HoverContextType {
  hover: Hover;
  setHover: React.Dispatch<React.SetStateAction<Hover>>;
}

type Hover = {
  hoverSeconds: number;
};

interface Telemetry {
  velocity: number;
  altitude: number;
}

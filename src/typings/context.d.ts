// general context provider for combining multiple contexts
type Provider = ({ children }: { children: React.ReactNode }) => React.ReactElement;

interface ClockContextType {
  clock: Clock;
  setClock: React.Dispatch<React.SetStateAction<Clock>>;
}

type Clock = {
  appSeconds: number;
  isRunning: boolean;
};

interface HoverContextType {
  hover: Hover;
  setHover: React.Dispatch<React.SetStateAction<Hover>>;
}

type Hover = {
  hoverSeconds: number;
};

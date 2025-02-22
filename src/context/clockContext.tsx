import { createContext, JSX, ReactNode, useContext, useReducer } from "react";

// Define ClockAction union and reducer function
type ClockAction =
  | { type: "start" }
  | { type: "stop" }
  | { type: "setAppSeconds"; appSeconds: number };

// Define combined context type:
interface ClockContextValue {
  clock: Clock;
  clockDispatch: React.Dispatch<ClockAction>;
}

const ClockCtx = createContext<ClockContextValue | undefined>(undefined);

const clockReducer = (state: Clock, action: ClockAction): Clock => {
  switch (action.type) {
    case "start":
      return {
        ...state,
        startStopTimestamp: new Date().toISOString(),
        isRunning: true,
        // Optionally reset or update appSecondsAtStartStop as needed
      };
    case "stop":
      const appSeconds = Math.floor(
        state.appSecondsAtStartStop + (Date.now() - Date.parse(state.startStopTimestamp)) / 1000
      );
      return {
        ...state,
        startStopTimestamp: new Date().toISOString(),
        appSecondsAtStartStop: appSeconds,
        isRunning: false,
        // Optionally update appSecondsAtStartStop as needed
      };
    case "setAppSeconds":
      return {
        ...state,
        appSecondsAtStartStop: action.appSeconds,
        startStopTimestamp: new Date().toISOString(),
      };
    default:
      return state;
  }
};

// Provider component using reducer:
export const ClockContextProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  // ...existing code for initial clock state...
  const initialClock: Clock = {
    startStopTimestamp: new Date().toISOString(),
    appSecondsAtStartStop: 0,
    isRunning: false,
  };

  const [clock, clockDispatch] = useReducer(clockReducer, initialClock);

  return <ClockCtx.Provider value={{ clock, clockDispatch }}>{children}</ClockCtx.Provider>;
};

// New hook to consume combined clock context:
export const useClockContext = (): ClockContextValue => {
  const context = useContext(ClockCtx);
  if (context === undefined) {
    throw new Error("useClockContext must be used within a ClockContextProvider");
  }
  return context;
};

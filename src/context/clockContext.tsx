import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";

// Create the context
const ClockCtx = createContext<ClockContextType | undefined>(undefined);

// Provider component
export const ClockContextProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [clock, setClock] = useState<Clock>({
    appSeconds: 28800, // 08:00:00Z
    isRunning: false,
  });

  const clockIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // setup the interval to update the clock if the clock is running
  useEffect(() => {
    if (clock.isRunning) {
      clockIntervalRef.current = setInterval(() => {
        setClock((prev) => ({
          ...prev,
          appSeconds: prev.appSeconds + 1,
        }));
      }, 1000);
    } else {
      clearInterval(clockIntervalRef.current);
    }
    return () => clearInterval(clockIntervalRef.current);
  }, [clock.isRunning, clockIntervalRef]);

  return <ClockCtx.Provider value={{ clock, setClock }}>{children}</ClockCtx.Provider>;
};

// Custom hook for consuming the context
export const useClockContext = (): ClockContextType => {
  const context = useContext(ClockCtx);
  if (!context) {
    throw new Error("useClockContext must be used within a ClockContextProvider");
  }
  return context;
};

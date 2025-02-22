import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";

// Define Clock type interface as before
// ...existing code...

// Split into two contexts:
const ClockStateCtx = createContext<Clock | undefined>(undefined);
const ClockUpdateCtx = createContext<React.Dispatch<React.SetStateAction<Clock>> | undefined>(
  undefined
);

// Provider component
export const ClockContextProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [clock, setClock] = useState<Clock>({
    appSeconds: 28800, // 08:00:00Z
    isRunning: false,
  });

  const clockIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
  }, [clock.isRunning]);

  return (
    <ClockStateCtx.Provider value={clock}>
      <ClockUpdateCtx.Provider value={setClock}>{children}</ClockUpdateCtx.Provider>
    </ClockStateCtx.Provider>
  );
};

// New hooks for separate usage:
export const useClockState = (): Clock => {
  const context = useContext(ClockStateCtx);
  if (context === undefined) {
    throw new Error("useClockState must be used within a ClockContextProvider");
  }
  return context;
};

export const useClockUpdate = (): React.Dispatch<React.SetStateAction<Clock>> => {
  const context = useContext(ClockUpdateCtx);
  if (context === undefined) {
    throw new Error("useClockUpdate must be used within a ClockContextProvider");
  }
  return context;
};

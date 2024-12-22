import { createContext, ReactNode, useContext, useState } from "react";

// Create the context
const HoverCtx = createContext<HoverContextType | undefined>(undefined);

// Provider component
export const HoverContextProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [hover, setHover] = useState<Hover>({
    hoverSeconds: null,
  });

  return <HoverCtx.Provider value={{ hover, setHover }}>{children}</HoverCtx.Provider>;
};

// Custom hook for consuming the context
export const useHoverContext = (): HoverContextType => {
  const context = useContext(HoverCtx);
  if (!context) {
    throw new Error("useHoverContext must be used within a HoverContextProvider");
  }
  return context;
};

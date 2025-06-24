import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../index";

export const useStateHover = (): {
  hoverSeconds: number | null;
  setHoverSeconds: (seconds: number | null) => void;
  hoveredDate: string | null;
  setHoveredDate: (date: string | null) => void;
} =>
  useAppStore(
    useShallow((state) => ({
      hoverSeconds: state.hoverSeconds,
      setHoverSeconds: state.setHoverSeconds,
      hoveredDate: state.hoveredDate,
      setHoveredDate: state.setHoveredDate,
    }))
  );

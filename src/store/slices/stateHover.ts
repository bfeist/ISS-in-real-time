import { StateCreator } from "zustand";

export const createStateHover: StateCreator<AppState, [], [], HoverState> = (set) => ({
  // Hover initial state
  hoverSeconds: null,
  hoveredDate: null,

  // Actions
  setHoverSeconds: (seconds: number | null) => set({ hoverSeconds: seconds }),
  setHoveredDate: (date: string | null) => set({ hoveredDate: date }),
});

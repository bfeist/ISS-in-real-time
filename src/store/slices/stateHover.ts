import { StateCreator } from "zustand";
import type { AppStore, HoverSlice } from "../types";

export const createHoverSlice: StateCreator<AppStore, [], [], HoverSlice> = (
  set,
  _get,
  _store
) => ({
  hover: {
    hoverSeconds: null,
    hoveredDate: null,
    setHoverSeconds: (seconds: number | null) =>
      set((state) => ({
        hover: {
          ...state.hover,
          hoverSeconds: seconds,
        },
      })),
    setHoveredDate: (date: string | null) =>
      set((state) => ({
        hover: {
          ...state.hover,
          hoveredDate: date,
        },
      })),
  },
});

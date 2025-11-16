import type { HoverSlice } from "../types";
import { useAppStore } from "../index";

export const useStateHover = (): HoverSlice["hover"] => useAppStore((state) => state.hover);

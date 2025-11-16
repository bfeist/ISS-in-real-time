import type { ToggleSlice } from "../types";
import { useAppStore } from "../index";

export const useStateToggle = (): ToggleSlice["toggles"] => useAppStore((state) => state.toggles);

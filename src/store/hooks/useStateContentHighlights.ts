import type { ContentHighlightsSlice } from "../types";
import { useAppStore } from "../index";

export const useStateContentHighlights = (): ContentHighlightsSlice["contentHighlights"] =>
  useAppStore((state) => state.contentHighlights);

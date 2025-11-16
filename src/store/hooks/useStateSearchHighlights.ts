import type { SearchHighlightsSlice } from "store/types";
import { useAppStore } from "../index";

export const useStateSearchHighlights = (): SearchHighlightsSlice["searchHighlights"] =>
  useAppStore((state) => state.searchHighlights);

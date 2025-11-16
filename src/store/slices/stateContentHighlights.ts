import { StateCreator } from "zustand";
import type { AppStore, ContentHighlightsSlice } from "../types";

export const createContentHighlightsSlice: StateCreator<
  AppStore,
  [],
  [],
  ContentHighlightsSlice
> = (set, _get, _store) => {
  const patchList = (updater: (list: string[]) => string[]) =>
    set((state) => ({
      contentHighlights: {
        ...state.contentHighlights,
        contentHighlights: updater(state.contentHighlights.contentHighlights),
      },
    }));

  return {
    contentHighlights: {
      contentHighlights: [],
      addContentHighlight: (highlight: string) =>
        patchList((list) => (list.includes(highlight) ? list : [...list, highlight])),
      removeContentHighlight: (highlight: string) =>
        patchList((list) => list.filter((h) => h !== highlight)),
      toggleContentHighlight: (highlight: string) =>
        patchList((list) =>
          list.includes(highlight) ? list.filter((h) => h !== highlight) : [...list, highlight]
        ),
      clearContentHighlights: () => patchList(() => []),
    },
  };
};

import { StateCreator } from "zustand";

export const createStateContentHighlights: StateCreator<
  AppState,
  [],
  [],
  ContentHighlightsState
> = (set) => ({
  // Content highlights initial state
  contentHighlights: [],

  // Actions
  addContentHighlight: (highlight: string) =>
    set((state) => ({
      contentHighlights: state.contentHighlights.includes(highlight)
        ? state.contentHighlights
        : [...state.contentHighlights, highlight],
    })),
  removeContentHighlight: (highlight: string) =>
    set((state) => ({
      contentHighlights: state.contentHighlights.filter((h) => h !== highlight),
    })),
  toggleContentHighlight: (highlight: string) =>
    set((state) => ({
      contentHighlights: state.contentHighlights.includes(highlight)
        ? state.contentHighlights.filter((h) => h !== highlight)
        : [...state.contentHighlights, highlight],
    })),
  clearContentHighlights: () => set({ contentHighlights: [] }),
});

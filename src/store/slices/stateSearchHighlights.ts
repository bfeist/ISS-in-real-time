import { StateCreator } from "zustand";
import type { AppStore, SearchHighlightsSlice } from "../types";

export const createCrewSelectionSlice: StateCreator<AppStore, [], [], SearchHighlightsSlice> = (
  set,
  _get,
  _store
) => ({
  searchHighlights: {
    selectedCrewMember: null,
    selectedExpedition: null,
    selectedNotableMoment: null,
    setSelectedCrewMember: (crewMember: CrewMember | null) =>
      set((state) => ({
        searchHighlights: {
          ...state.searchHighlights,
          selectedCrewMember: crewMember,
        },
      })),
    setSelectedExpedition: (expedition: ExpeditionInfo | null) =>
      set((state) => ({
        searchHighlights: {
          ...state.searchHighlights,
          selectedExpedition: expedition,
        },
      })),
    setSelectedNotableMoment: (notableMoment: NotableMomentItem | null) =>
      set((state) => ({
        searchHighlights: {
          ...state.searchHighlights,
          selectedNotableMoment: notableMoment,
        },
      })),
    clearAllSearchHighlights: () =>
      set((state) => ({
        searchHighlights: {
          ...state.searchHighlights,
          selectedCrewMember: null,
          selectedExpedition: null,
          selectedNotableMoment: null,
        },
      })),
  },
});

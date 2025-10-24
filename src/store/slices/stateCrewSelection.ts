import { StateCreator } from "zustand";

export const createStateCrewSelection: StateCreator<AppState, [], [], CrewSelectionState> = (
  set
) => ({
  // Crew selection initial state
  selectedCrewMember: null,
  selectedExpedition: null,
  selectedNotableMoment: null,

  // Actions
  setSelectedCrewMember: (crewMember: CrewMember | null) => set({ selectedCrewMember: crewMember }),
  setSelectedExpedition: (expedition: ExpeditionInfo | null) =>
    set({ selectedExpedition: expedition }),
  setSelectedNotableMoment: (notableMoment: NotableMomentItem | null) =>
    set({ selectedNotableMoment: notableMoment }),
  clearAllSearchHighlights: () =>
    set({ selectedCrewMember: null, selectedExpedition: null, selectedNotableMoment: null }),
});

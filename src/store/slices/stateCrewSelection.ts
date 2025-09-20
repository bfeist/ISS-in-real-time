import { StateCreator } from "zustand";

export const createStateCrewSelection: StateCreator<AppState, [], [], CrewSelectionState> = (
  set
) => ({
  // Crew selection initial state
  selectedCrewMember: null,
  selectedExpedition: null,

  // Actions
  setSelectedCrewMember: (crewMember: CrewMember | null) => set({ selectedCrewMember: crewMember }),
  setSelectedExpedition: (expedition: ExpeditionInfo | null) =>
    set({ selectedExpedition: expedition }),
  clearAllSearchHighlights: () => set({ selectedCrewMember: null, selectedExpedition: null }),
});

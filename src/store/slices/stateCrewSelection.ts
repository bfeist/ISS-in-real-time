import { StateCreator } from "zustand";

export const createStateCrewSelection: StateCreator<AppState, [], [], CrewSelectionState> = (
  set
) => ({
  // Crew selection initial state
  selectedCrewMember: null,

  // Actions
  setSelectedCrewMember: (crewMember: CrewMember | null) => set({ selectedCrewMember: crewMember }),
});

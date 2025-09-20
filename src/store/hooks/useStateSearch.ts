import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../index";

export const useStateSearch = (): {
  selectedCrewMember: CrewMember | null;
  setSelectedCrewMember: (crewMember: CrewMember | null) => void;
  selectedExpedition: ExpeditionInfo | null;
  setSelectedExpedition: (expedition: ExpeditionInfo | null) => void;
  clearAllSearchHighlights: () => void;
} =>
  useAppStore(
    useShallow((state) => ({
      selectedCrewMember: state.selectedCrewMember,
      setSelectedCrewMember: state.setSelectedCrewMember,
      selectedExpedition: state.selectedExpedition,
      setSelectedExpedition: state.setSelectedExpedition,
      clearAllSearchHighlights: state.clearAllSearchHighlights,
    }))
  );

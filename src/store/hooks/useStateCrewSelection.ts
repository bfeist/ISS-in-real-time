import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../index";

export const useStateCrewSelection = (): {
  selectedCrewMember: CrewMember | null;
  setSelectedCrewMember: (crewMember: CrewMember | null) => void;
} =>
  useAppStore(
    useShallow((state) => ({
      selectedCrewMember: state.selectedCrewMember,
      setSelectedCrewMember: state.setSelectedCrewMember,
    }))
  );

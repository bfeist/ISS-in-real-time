import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../index";

export const useStateContentHighlights = (): {
  contentHighlights: string[];
  addContentHighlight: (highlight: string) => void;
  removeContentHighlight: (highlight: string) => void;
  toggleContentHighlight: (highlight: string) => void;
  clearContentHighlights: () => void;
} =>
  useAppStore(
    useShallow((state) => ({
      contentHighlights: state.contentHighlights,
      addContentHighlight: state.addContentHighlight,
      removeContentHighlight: state.removeContentHighlight,
      toggleContentHighlight: state.toggleContentHighlight,
      clearContentHighlights: state.clearContentHighlights,
    }))
  );

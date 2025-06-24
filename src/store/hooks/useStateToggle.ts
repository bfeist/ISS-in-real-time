import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../index";

export const useStateToggle = (): {
  globalMute: boolean;
  setGlobalMute: (mute: boolean) => void;
  showGlobe: boolean;
  setShowGlobe: (show: boolean) => void;
} =>
  useAppStore(
    useShallow((state) => ({
      globalMute: state.globalMute,
      setGlobalMute: state.setGlobalMute,
      showGlobe: state.showGlobe,
      setShowGlobe: state.setShowGlobe,
    }))
  );

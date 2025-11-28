import { StateCreator } from "zustand";
import type { AppStore, ToggleSlice } from "../types";

export const createToggleSlice: StateCreator<AppStore, [], [], ToggleSlice> = (
  set,
  _get,
  _store
) => {
  const patch = (partial: Partial<ToggleSlice["toggles"]>) =>
    set((state) => ({
      toggles: {
        ...state.toggles,
        ...partial,
      },
    }));

  return {
    toggles: {
      commMute: false,
      videoMute: true,
      showGlobe: true,
      showTimelineYears: false,
      hoveringYearsLabels: false,
      showEarthPhotos: true,
      showMissionPhotos: true,
      showTimelapsePhotos: true,
      showCloudsOverlay: true,
      setCommMute: (mute: boolean) => patch({ commMute: mute }),
      setVideoMute: (mute: boolean) => patch({ videoMute: mute }),
      setShowGlobe: (show: boolean) => patch({ showGlobe: show }),
      setShowTimelineYears: (show: boolean) => patch({ showTimelineYears: show }),
      setHoveringYearsLabels: (hovering: boolean) => patch({ hoveringYearsLabels: hovering }),
      setShowEarthPhotos: (show: boolean) => patch({ showEarthPhotos: show }),
      setShowMissionPhotos: (show: boolean) => patch({ showMissionPhotos: show }),
      setShowTimelapsePhotos: (show: boolean) => patch({ showTimelapsePhotos: show }),
      setShowCloudsOverlay: (show: boolean) => patch({ showCloudsOverlay: show }),
    },
  };
};

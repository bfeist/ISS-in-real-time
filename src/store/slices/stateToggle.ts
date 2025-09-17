import { StateCreator } from "zustand";

export const createStateToggle: StateCreator<AppState, [], [], ToggleState> = (set) => ({
  // ToggleState initial state
  globalMute: true,
  showGlobe: true,
  showTimelineYears: false,
  hoveringYearsLabels: false,
  showEarthPhotos: true,
  showMissionPhotos: true,

  // Actions
  setGlobalMute: (mute: boolean) => set({ globalMute: mute }),
  setShowGlobe: (show: boolean) => set({ showGlobe: show }),
  setShowTimelineYears: (show: boolean) => set({ showTimelineYears: show }),
  setHoveringYearsLabels: (hovering: boolean) => set({ hoveringYearsLabels: hovering }),
  setShowEarthPhotos: (show: boolean) => set({ showEarthPhotos: show }),
  setShowMissionPhotos: (show: boolean) => set({ showMissionPhotos: show }),
});

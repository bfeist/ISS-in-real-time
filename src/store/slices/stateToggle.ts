import { StateCreator } from "zustand";

export const createStateToggle: StateCreator<AppState, [], [], ToggleState> = (set) => ({
  // ToggleState initial state
  commMute: false,
  videoMute: true, // Start videos muted by default
  showGlobe: true,
  showTimelineYears: false,
  hoveringYearsLabels: false,
  showEarthPhotos: false,
  showMissionPhotos: true,
  showTimelapsePhotos: false,

  // Actions
  setCommMute: (mute: boolean) => set({ commMute: mute }),
  setVideoMute: (mute: boolean) => set({ videoMute: mute }),
  setShowGlobe: (show: boolean) => set({ showGlobe: show }),
  setShowTimelineYears: (show: boolean) => set({ showTimelineYears: show }),
  setHoveringYearsLabels: (hovering: boolean) => set({ hoveringYearsLabels: hovering }),
  setShowEarthPhotos: (show: boolean) => set({ showEarthPhotos: show }),
  setShowMissionPhotos: (show: boolean) => set({ showMissionPhotos: show }),
  setShowTimelapsePhotos: (show: boolean) => set({ showTimelapsePhotos: show }),
});

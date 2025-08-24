import { StateCreator } from "zustand";

export const createStateToggle: StateCreator<AppState, [], [], ToggleState> = (set) => ({
  // ToggleState initial state
  globalMute: true,
  showGlobe: true,
  showTimelineYears: false,
  hoveringYearsLabels: false,

  // Actions
  setGlobalMute: (mute: boolean) => set({ globalMute: mute }),
  setShowGlobe: (show: boolean) => set({ showGlobe: show }),
  setShowTimelineYears: (show: boolean) => set({ showTimelineYears: show }),
  setHoveringYearsLabels: (hovering: boolean) => set({ hoveringYearsLabels: hovering }),
});

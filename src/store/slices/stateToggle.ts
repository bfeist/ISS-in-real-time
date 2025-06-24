import { StateCreator } from "zustand";

export const createStateToggle: StateCreator<AppState, [], [], ToggleState> = (set) => ({
  // ToggleState initial state
  globalMute: true,
  showGlobe: true,

  // Actions
  setGlobalMute: (mute: boolean) => set({ globalMute: mute }),
  setShowGlobe: (show: boolean) => set({ showGlobe: show }),
});

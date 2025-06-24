import { create, StateCreator } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

const createStore: StateCreator<AppState> = (set) => ({
  // Clock initial state
  startStopTimestamp: new Date().toISOString(),
  appSecondsAtStartStop: 0,
  isRunning: false,

  // Actions
  startClock: () =>
    set(() => ({
      startStopTimestamp: new Date().toISOString(),
      isRunning: true,
    })),

  stopClock: () =>
    set((state: AppState) => {
      const appSeconds = Math.floor(
        state.appSecondsAtStartStop + (Date.now() - Date.parse(state.startStopTimestamp)) / 1000
      );
      return {
        startStopTimestamp: new Date().toISOString(),
        appSecondsAtStartStop: appSeconds,
        isRunning: false,
      };
    }),

  setClock: (seconds: number) =>
    set(() => ({
      appSecondsAtStartStop: seconds,
      startStopTimestamp: new Date().toISOString(),
    })),

  // Hover initial state and actions
  hoverSeconds: null,
  hoveredDate: null,
  // Actions
  setHoverSeconds: (seconds: number | null) => set({ hoverSeconds: seconds }),
  setHoveredDate: (date: string | null) => set({ hoveredDate: date }),

  // Selected date initial state and actions
  selectedDate: null,
  // Actions
  setSelectedDate: (date: string | null) => set({ selectedDate: date }),

  // ToggleState initial state
  globalMute: true,
  showGlobe: true,
  // Actions
  setGlobalMute: (mute: boolean) => set({ globalMute: mute }),
  setShowGlobe: (show: boolean) => set({ showGlobe: show }),

  // Crew selection initial state
  selectedCrewMember: null,
  // Actions
  setSelectedCrewMember: (crewMember: CrewMember | null) => set({ selectedCrewMember: crewMember }),

  // Content highlights initial state
  contentHighlights: [],
  // Actions
  addContentHighlight: (highlight: string) =>
    set((state) => ({
      contentHighlights: state.contentHighlights.includes(highlight)
        ? state.contentHighlights
        : [...state.contentHighlights, highlight],
    })),
  removeContentHighlight: (highlight: string) =>
    set((state) => ({
      contentHighlights: state.contentHighlights.filter((h) => h !== highlight),
    })),
  toggleContentHighlight: (highlight: string) =>
    set((state) => ({
      contentHighlights: state.contentHighlights.includes(highlight)
        ? state.contentHighlights.filter((h) => h !== highlight)
        : [...state.contentHighlights, highlight],
    })),
  clearContentHighlights: () => set({ contentHighlights: [] }),
});

// Create store with redux devtools middleware
export const useAppStore = create<AppState>()(
  devtools(createStore, { name: "ISSiRT Zustand Store" })
);

// Create selector hooks for better performance
export const useStateClock = (): {
  startStopTimestamp: string;
  appSecondsAtStartStop: number;
  isRunning: boolean;
  startClock: () => void;
  stopClock: () => void;
  setClock: (seconds: number) => void;
} =>
  useAppStore(
    useShallow((state) => ({
      startStopTimestamp: state.startStopTimestamp,
      appSecondsAtStartStop: state.appSecondsAtStartStop,
      isRunning: state.isRunning,
      startClock: state.startClock,
      stopClock: state.stopClock,
      setClock: state.setClock,
    }))
  );

export const useStateHover = (): {
  hoverSeconds: number | null;
  setHoverSeconds: (seconds: number | null) => void;
  hoveredDate: string | null;
  setHoveredDate: (date: string | null) => void;
} =>
  useAppStore(
    useShallow((state) => ({
      hoverSeconds: state.hoverSeconds,
      setHoverSeconds: state.setHoverSeconds,
      hoveredDate: state.hoveredDate,
      setHoveredDate: state.setHoveredDate,
    }))
  );

export const useStateSelectedDate = (): {
  selectedDate: string | null;
  setSelectedDate: (date: string | null) => void;
} =>
  useAppStore(
    useShallow((state) => ({
      selectedDate: state.selectedDate,
      setSelectedDate: state.setSelectedDate,
    }))
  );

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

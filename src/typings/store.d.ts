interface ClockState {
  startStopTimestamp: string;
  appSecondsAtStartStop: number;
  isRunning: boolean;

  // Actions
  startClock: () => void;
  stopClock: () => void;
  setClock: (seconds: number) => void;
}

interface SelectedDateState {
  selectedDate: string | null;

  // Actions
  setSelectedDate: (date: string | null) => void;
}

interface HoverState {
  hoverSeconds: number | null;
  hoveredDate: string | null;

  // Actions
  setHoverSeconds: (seconds: number | null) => void;
  setHoveredDate: (date: string | null) => void;
}

interface ToggleState {
  globalMute: boolean;
  showGlobe: boolean;
  showTimelineYears: boolean;

  // Actions
  setGlobalMute: (mute: boolean) => void;
  setShowGlobe: (show: boolean) => void;
  setShowTimelineYears: (show: boolean) => void;
}

interface CrewSelectionState {
  selectedCrewMember: CrewMember | null;

  // Actions
  setSelectedCrewMember: (crewMember: CrewMember | null) => void;
}

interface ContentHighlightsState {
  contentHighlights: string[];

  // Actions
  addContentHighlight: (highlight: string) => void;
  removeContentHighlight: (highlight: string) => void;
  toggleContentHighlight: (highlight: string) => void;
  clearContentHighlights: () => void;
}

// Combined store type
interface AppState
  extends ClockState,
    HoverState,
    SelectedDateState,
    ToggleState,
    CrewSelectionState,
    ContentHighlightsState {}

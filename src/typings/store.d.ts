interface ClockState {
  startStopTimestamp: string;
  appSecondsAtStartStop: number;
  isRunning: boolean;
  selectedDate: string | null;

  // Actions
  startClock: () => void;
  stopClock: () => void;
  setClock: (seconds: number) => void;
  setSelectedDate: (date: string | null) => void;
  handleDayRollover: () => void;
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
  hoveringYearsLabels: boolean;

  // Actions
  setGlobalMute: (mute: boolean) => void;
  setShowGlobe: (show: boolean) => void;
  setShowTimelineYears: (show: boolean) => void;
  setHoveringYearsLabels: (hovering: boolean) => void;
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
    ToggleState,
    CrewSelectionState,
    ContentHighlightsState {}

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
  commMute: boolean;
  videoMute: boolean;
  showGlobe: boolean;
  showTimelineYears: boolean;
  hoveringYearsLabels: boolean;
  showEarthPhotos: boolean;
  showMissionPhotos: boolean;
  showTimelapsePhotos: boolean;

  // Actions
  setCommMute: (mute: boolean) => void;
  setVideoMute: (mute: boolean) => void;
  setShowGlobe: (show: boolean) => void;
  setShowTimelineYears: (show: boolean) => void;
  setHoveringYearsLabels: (hovering: boolean) => void;
  setShowEarthPhotos: (show: boolean) => void;
  setShowMissionPhotos: (show: boolean) => void;
  setShowTimelapsePhotos: (show: boolean) => void;
}

interface CrewSelectionState {
  selectedCrewMember: CrewMember | null;
  selectedExpedition: ExpeditionInfo | null;

  // Actions
  setSelectedCrewMember: (crewMember: CrewMember | null) => void;
  setSelectedExpedition: (expedition: ExpeditionInfo | null) => void;
  clearAllSearchHighlights: () => void;
}

interface ContentHighlightsState {
  contentHighlights: string[];

  // Actions
  addContentHighlight: (highlight: string) => void;
  removeContentHighlight: (highlight: string) => void;
  toggleContentHighlight: (highlight: string) => void;
  clearContentHighlights: () => void;
}

interface DayNightState {
  dayNight: DayNightObj[];

  // Actions
  setDayNight: (dayNight: DayNightObj[]) => void;
}

// Combined store type
interface AppState
  extends ClockState,
    HoverState,
    ToggleState,
    CrewSelectionState,
    ContentHighlightsState,
    DayNightState {}

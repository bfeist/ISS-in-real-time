export type DateSelectionOptions = {
  includeTimeInUrl?: boolean;
};

export type ClockSlice = {
  clock: {
    startStopTimestamp: string;
    appSecondsAtStartStop: number;
    isRunning: boolean;
    selectedDate: string | null;
    startClock: () => void;
    stopClock: () => void;
    setTimeOnly: (seconds: number, options?: DateSelectionOptions) => void;
    setDateOnly: (date: string | null, options?: DateSelectionOptions) => void;
    setDateTime: (
      date: string | null,
      seconds: number | null,
      options?: DateSelectionOptions
    ) => void;
    handleDayRollover: () => void;
  };
};

export type HoverSlice = {
  hover: {
    hoverSeconds: number | null;
    hoveredDate: string | null;
    setHoverSeconds: (seconds: number | null) => void;
    setHoveredDate: (date: string | null) => void;
  };
};

export type ToggleSlice = {
  toggles: {
    commMute: boolean;
    setCommMute: (mute: boolean) => void;
    videoMute: boolean;
    setVideoMute: (mute: boolean) => void;
    showGlobe: boolean;
    setShowGlobe: (show: boolean) => void;
    showTimelineYears: boolean;
    setShowTimelineYears: (show: boolean) => void;
    hoveringYearsLabels: boolean;
    setHoveringYearsLabels: (hovering: boolean) => void;
    showEarthPhotos: boolean;
    setShowEarthPhotos: (show: boolean) => void;
    showMissionPhotos: boolean;
    setShowMissionPhotos: (show: boolean) => void;
    showTimelapsePhotos: boolean;
    setShowTimelapsePhotos: (show: boolean) => void;
    showCloudsOverlay: boolean;
    setShowCloudsOverlay: (show: boolean) => void;
  };
};

export type SearchHighlightsSlice = {
  searchHighlights: {
    selectedCrewMember: CrewMember | null;
    setSelectedCrewMember: (crewMember: CrewMember | null) => void;
    selectedExpedition: ExpeditionInfo | null;
    setSelectedExpedition: (expedition: ExpeditionInfo | null) => void;
    selectedNotableMoment: NotableMomentItem | null;
    setSelectedNotableMoment: (notableMoment: NotableMomentItem | null) => void;
    clearAllSearchHighlights: () => void;
  };
};

export type ContentHighlightsSlice = {
  contentHighlights: {
    contentHighlights: string[];
    addContentHighlight: (highlight: string) => void;
    removeContentHighlight: (highlight: string) => void;
    toggleContentHighlight: (highlight: string) => void;
    clearContentHighlights: () => void;
  };
};

export type DayNightSlice = {
  dayNight: {
    dayNight: DayNightObj[];
    setDayNight: (dayNight: DayNightObj[]) => void;
  };
};

export type AppStore = ClockSlice &
  HoverSlice &
  ToggleSlice &
  SearchHighlightsSlice &
  ContentHighlightsSlice &
  DayNightSlice;

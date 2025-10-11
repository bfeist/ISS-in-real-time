import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import styles from "./timelineYears.module.css";
import mouseHintStyles from "./mouseHint.module.css";
import { useStateToggle } from "../../store/hooks/useStateToggle";
import { useStateHover } from "../../store/hooks/useStateHover";
import HighlightData from "./subcomponents/highlightData";
import YearCanvas, {
  COLORS,
  MONTH_GAP,
  ROW_GAP,
  YEAR_CANVAS_HEIGHT,
} from "./subcomponents/yearCanvas";
import MegaYearOverlay from "./subcomponents/megaYearOverlay";
import { useAutoEdgeScroll } from "./hooks/useAutoEdgeScroll";
import { isTouchLikeInteraction, type InteractionMode } from "./types";

// ---------------------------------------------------------------------------
// Local mouse hint controller
// ---------------------------------------------------------------------------

const HINT_DELAY_MS = 4000;

type MouseHintController = {
  showHint: boolean;
  markInteracted: () => void;
  hasInteracted: boolean;
};

const clearHintTimer = (timerRef: React.MutableRefObject<NodeJS.Timeout | null>) => {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
};

const useMouseHint = (isTimelineVisible: boolean): MouseHintController => {
  const [showHint, setShowHint] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasInteractedRef = useRef(false);

  const markInteracted = useCallback(() => {
    hasInteractedRef.current = true;
    clearHintTimer(timerRef);
    setShowHint(false);
  }, []);

  useEffect(() => {
    clearHintTimer(timerRef);

    if (!isTimelineVisible) {
      setShowHint(false);
      return () => {
        clearHintTimer(timerRef);
      };
    }

    if (hasInteractedRef.current) {
      setShowHint(false);
      return () => {
        clearHintTimer(timerRef);
      };
    }

    timerRef.current = setTimeout(() => {
      setShowHint(true);
    }, HINT_DELAY_MS);

    return () => {
      clearHintTimer(timerRef);
    };
  }, [isTimelineVisible]);

  return {
    showHint,
    markInteracted,
    hasInteracted: hasInteractedRef.current,
  };
};

// ---------------------------------------------------------------------------
// Local mega overlay state controller
// ---------------------------------------------------------------------------

type OverlayPosition = {
  left: number;
  top: number;
  width: number;
};

type MegaOverlayController = {
  visible: boolean;
  year: number | null;
  position: OverlayPosition;
  activeYearIndex: number | null;
  open: (yearIndex: number, options?: { preservePosition?: boolean }) => void;
  close: () => void;
  scheduleHide: (delayMs: number) => void;
  cancelHide: () => void;
  pointerEnteredOverlay: () => void;
  pointerLeftOverlay: (delayMs: number) => void;
};

const DEFAULT_POSITION: OverlayPosition = { left: 0, top: 0, width: 0 };

type UseMegaOverlayStateOptions = {
  containerRef: RefObject<HTMLDivElement>;
  years: number[];
  onClose?: () => void;
  overlayWidthMultiplier?: number;
  yearHeaderHeight?: number;
  overlayOffset?: number;
};

const useMegaOverlayState = ({
  containerRef,
  years,
  onClose,
  overlayWidthMultiplier = 2,
  yearHeaderHeight = 25,
  overlayOffset = 2,
}: UseMegaOverlayStateOptions): MegaOverlayController => {
  const [visible, setVisible] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [position, setPosition] = useState<OverlayPosition>(DEFAULT_POSITION);
  const [activeYearIndex, setActiveYearIndex] = useState<number | null>(null);

  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pointerInsideOverlayRef = useRef(false);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearHideTimeout();
    pointerInsideOverlayRef.current = false;
    setVisible(false);
    setYear(null);
    setPosition(DEFAULT_POSITION);
    setActiveYearIndex(null);
    onClose?.();
  }, [clearHideTimeout, onClose]);

  const open = useCallback(
    (yearIndex: number, options?: { preservePosition?: boolean }) => {
      const preservePosition = options?.preservePosition ?? false;
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const yearElements = container.querySelectorAll<HTMLElement>("[data-year-index]");
      const yearElement = yearElements[yearIndex];
      if (!yearElement) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const yearRect = yearElement.getBoundingClientRect();
      const overlayWidth = yearRect.width * overlayWidthMultiplier;

      let left: number;
      if (yearIndex === 0) {
        left = 0;
      } else if (yearIndex === years.length - 1) {
        left = containerRect.width - overlayWidth;
      } else {
        left = yearRect.left - containerRect.left + yearRect.width / 2 - overlayWidth / 2;
      }

      const top = yearRect.top - containerRect.top + yearHeaderHeight + overlayOffset;

      clearHideTimeout();
      pointerInsideOverlayRef.current = false;
      setVisible(true);
      setYear(years[yearIndex]);
      setPosition((prevPosition) => {
        if (preservePosition && prevPosition.width !== 0) {
          return { left: prevPosition.left, top, width: overlayWidth };
        }

        return { left, top, width: overlayWidth };
      });
      setActiveYearIndex(yearIndex);
    },
    [clearHideTimeout, containerRef, overlayOffset, overlayWidthMultiplier, yearHeaderHeight, years]
  );

  const scheduleHide = useCallback(
    (delayMs: number) => {
      clearHideTimeout();
      hideTimeoutRef.current = setTimeout(() => {
        if (!pointerInsideOverlayRef.current) {
          close();
        }
      }, delayMs);
    },
    [clearHideTimeout, close]
  );

  const cancelHide = useCallback(() => {
    clearHideTimeout();
  }, [clearHideTimeout]);

  const pointerEnteredOverlay = useCallback(() => {
    pointerInsideOverlayRef.current = true;
    clearHideTimeout();
  }, [clearHideTimeout]);

  const pointerLeftOverlay = useCallback(
    (delayMs: number) => {
      pointerInsideOverlayRef.current = false;
      scheduleHide(delayMs);
    },
    [scheduleHide]
  );

  useEffect(() => {
    return () => {
      clearHideTimeout();
    };
  }, [clearHideTimeout]);

  return {
    visible,
    year,
    position,
    activeYearIndex,
    open,
    close,
    scheduleHide,
    cancelHide,
    pointerEnteredOverlay,
    pointerLeftOverlay,
  };
};

// Configure dayjs to use UTC plugin
dayjs.extend(utc);

// Dynamic year calculation based on current date (like the old timeline system)
const now = new Date();
const START_YEAR = 2000; // Fixed start from November 2000
const END_YEAR = now.getFullYear(); // Dynamic end year
const YEAR_GAP = "2px"; // done in css
const MONTHS_IN_YEAR = 12;
const DAYS_IN_LONGEST_MONTH = 31;
const TIMELINE_WIDTH_MULTIPLIER = 1.25; // Extend timeline width by 25% beyond calculated max
const SCROLL_EDGE_TOLERANCE_PX = 8;

const ScrollIndicatorArrow: React.FC<{ direction: "left" | "right" }> = ({ direction }) => (
  <svg
    viewBox="0 0 56 56"
    role="presentation"
    aria-hidden="true"
    focusable="false"
    className={styles.scrollIndicatorArrowIcon}
    style={{ transform: direction === "right" ? "rotate(180deg)" : undefined }}
  >
    <path
      d="M34.5 12.5 19 28l15.5 15.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Props interface for the TimelineYears2 component
interface TimelineYears2Props {
  highlights: Map<
    string,
    { fill: string; stroke?: string; expedition?: boolean; notableDatetime?: string }
  >;
  selectedDate: string | null;
  commFirstData?: Record<string, CommFirstItem>;
}

// Main TimelineYears2 component
const TimelineYears2: React.FC<TimelineYears2Props> = ({
  highlights,
  selectedDate,
  commFirstData,
}) => {
  // Global state hooks
  const { showTimelineYears } = useStateToggle();
  const { hoveredDate, setHoveredDate } = useStateHover();

  // State to force redraw when timeline becomes visible
  const [forceRedrawCounter, setForceRedrawCounter] = useState(0);

  // Container ref for tooltip positioning
  const containerRef = useRef<HTMLDivElement>(null);
  const yearsScrollContainerRef = useRef<HTMLDivElement>(null);
  const megaOverlayRef =
    useRef<import("./subcomponents/megaYearOverlay").MegaYearOverlayHandle>(null);
  const { updateFromPointer: updateEdgeScrollFromPointer, stop: stopAutoScroll } =
    useAutoEdgeScroll(yearsScrollContainerRef, { isEnabled: showTimelineYears });

  // Mouse hint state - shows after 4 seconds of no interaction
  const { showHint: showMouseHint, markInteracted: markUserInteracted } =
    useMouseHint(showTimelineYears);

  const [interactionMode, setInteractionMode] = useState<InteractionMode>(() => "mouse");
  const ignoreMouseEventsUntilRef = useRef<number>(0);
  const pointerDownRef = useRef(false);
  const pointerPositionRef = useRef<{ x: number; y: number } | null>(null);
  const [scrollIndicators, setScrollIndicators] = useState({
    canScrollLeft: false,
    canScrollRight: false,
    isScrollable: false,
  });

  const getNow = useCallback(() => {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }

    return Date.now();
  }, []);

  const shouldIgnoreMouseEvents = useCallback(() => {
    if (ignoreMouseEventsUntilRef.current === 0) {
      return false;
    }

    return getNow() < ignoreMouseEventsUntilRef.current;
  }, [getNow]);

  const registerInteractionMode = useCallback(
    (mode: InteractionMode) => {
      setInteractionMode((prev) => (prev === mode ? prev : mode));

      if (mode === "touch" || mode === "pen") {
        ignoreMouseEventsUntilRef.current = getNow() + 800;
      } else {
        ignoreMouseEventsUntilRef.current = 0;
      }
    },
    [getNow]
  );

  const updateScrollIndicators = useCallback(() => {
    const container = yearsScrollContainerRef.current;
    if (!container) {
      setScrollIndicators((prev) =>
        prev.canScrollLeft || prev.canScrollRight || prev.isScrollable
          ? { canScrollLeft: false, canScrollRight: false, isScrollable: false }
          : prev
      );
      return;
    }

    const { scrollLeft, clientWidth, scrollWidth } = container;
    const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);

    if (maxScrollLeft <= SCROLL_EDGE_TOLERANCE_PX) {
      setScrollIndicators((prev) =>
        prev.isScrollable
          ? { canScrollLeft: false, canScrollRight: false, isScrollable: false }
          : prev
      );
      return;
    }

    const normalizedScrollLeft = Math.round(scrollLeft);
    const normalizedMaxScrollLeft = Math.round(maxScrollLeft);

    const canScrollLeft = normalizedScrollLeft > SCROLL_EDGE_TOLERANCE_PX;
    const canScrollRight =
      normalizedScrollLeft < normalizedMaxScrollLeft - SCROLL_EDGE_TOLERANCE_PX;

    setScrollIndicators((prev) => {
      if (
        prev.canScrollLeft === canScrollLeft &&
        prev.canScrollRight === canScrollRight &&
        prev.isScrollable
      ) {
        return prev;
      }

      return {
        canScrollLeft,
        canScrollRight,
        isScrollable: true,
      };
    });
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      if (shouldIgnoreMouseEvents()) {
        return;
      }

      registerInteractionMode("mouse");

      pointerDownRef.current = true;
      pointerPositionRef.current = { x: event.clientX, y: event.clientY };

      const hasActivePointer = pointerDownRef.current || pointerPositionRef.current !== null;
      updateEdgeScrollFromPointer(event.clientX, hasActivePointer);
      updateScrollIndicators();
      markUserInteracted();
    },
    [
      markUserInteracted,
      registerInteractionMode,
      shouldIgnoreMouseEvents,
      updateEdgeScrollFromPointer,
      updateScrollIndicators,
    ]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (shouldIgnoreMouseEvents()) {
        return;
      }

      registerInteractionMode("mouse");

      pointerPositionRef.current = { x: event.clientX, y: event.clientY };

      const hasActivePointer = pointerDownRef.current || pointerPositionRef.current !== null;
      updateEdgeScrollFromPointer(event.clientX, hasActivePointer);
      updateScrollIndicators();
      markUserInteracted();
    },
    [
      markUserInteracted,
      registerInteractionMode,
      shouldIgnoreMouseEvents,
      updateEdgeScrollFromPointer,
      updateScrollIndicators,
    ]
  );

  const handleOverlayPointerUpdate = useCallback(
    (clientX: number | null, clientY: number | null, hasActivePointer: boolean) => {
      if (!hasActivePointer || clientX === null || clientY === null) {
        pointerPositionRef.current = null;
        stopAutoScroll();
        return;
      }

      pointerPositionRef.current = { x: clientX, y: clientY };
      updateEdgeScrollFromPointer(clientX, true);
      updateScrollIndicators();
      markUserInteracted();
    },
    [markUserInteracted, stopAutoScroll, updateEdgeScrollFromPointer, updateScrollIndicators]
  );

  const handleMouseUp = useCallback(() => {
    if (shouldIgnoreMouseEvents()) {
      return;
    }

    pointerDownRef.current = false;
    pointerPositionRef.current = null;
    stopAutoScroll();
  }, [shouldIgnoreMouseEvents, stopAutoScroll]);

  const handleMouseLeave = useCallback(() => {
    if (!pointerDownRef.current) {
      stopAutoScroll();
    }
    pointerPositionRef.current = null;
    updateScrollIndicators();
  }, [stopAutoScroll, updateScrollIndicators]);

  // Audio refs and state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

  useEffect(() => {
    const container = yearsScrollContainerRef.current;
    if (!container) {
      setScrollIndicators({
        canScrollLeft: false,
        canScrollRight: false,
        isScrollable: false,
      });
      return;
    }

    updateScrollIndicators();

    const handleResize = () => {
      updateScrollIndicators();
    };

    window.addEventListener("resize", handleResize);

    let resizeObserver: ResizeObserver | null = null;

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateScrollIndicators();
      });
      resizeObserver.observe(container);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [showTimelineYears, updateScrollIndicators]);

  const getYearIndexFromPoint = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return null;
    const yearElements = containerRef.current.querySelectorAll("[data-year-index]");

    for (const element of Array.from(yearElements)) {
      const rect = (element as HTMLElement).getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        const indexAttr = (element as HTMLElement).getAttribute("data-year-index");
        if (indexAttr !== null) {
          const parsed = Number(indexAttr);
          if (!Number.isNaN(parsed)) {
            return parsed;
          }
        }
      }
    }

    return null;
  }, []);

  // Force redraw when timeline becomes visible
  useEffect(() => {
    if (showTimelineYears) {
      setForceRedrawCounter((prev) => prev + 1);
    }
  }, [showTimelineYears]);

  // Stop audio when a day is selected
  useEffect(() => {
    if (selectedDate && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [selectedDate]);

  // Debounced audio playback when hoveredDate changes
  useEffect(() => {
    if (!hoveredDate || !commFirstData || !audioRef.current || !showTimelineYears) {
      return;
    }

    // Stop any currently playing audio immediately when hoveredDate changes
    audioRef.current.pause();
    audioRef.current.currentTime = 0;

    // Create a debounce timer
    const timer = setTimeout(() => {
      const audioData = commFirstData[hoveredDate];
      if (audioData && audioData.filename) {
        const audioElement = audioRef.current;
        if (audioElement) {
          // Parse the hovered date to get year, month, day
          const date = dayjs.utc(hoveredDate);
          const year = date.format("YYYY");
          const month = date.format("MM");
          const day = date.format("DD");

          // Construct the full URL for the audio file
          const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL || "";
          const audioUrl = `${baseStaticUrl}/comm/${year}/${month}/${day}/${audioData.filename}`;

          // Stop any currently playing audio
          audioElement.pause();
          audioElement.currentTime = 0;

          // Set new source and play
          audioElement.src = audioUrl;

          // Only try to play if user has interacted with the page
          if (hasUserInteracted) {
            audioElement.play().catch((error) => {
              // Silently handle the error - this is expected behavior for hover audio
              if (error.name !== "NotAllowedError") {
                console.warn("Failed to play audio:", error);
              }
            });
          }
        }
      }
    }, 1000); // 1 second debounce

    // Cleanup function to clear the timer
    return () => {
      clearTimeout(timer);
    };
  }, [hoveredDate, commFirstData, hasUserInteracted, showTimelineYears]);

  // Track user interaction to enable audio playback
  useEffect(() => {
    const enableAudio = () => {
      setHasUserInteracted(true);
    };

    // Listen for various user interaction events
    document.addEventListener("click", enableAudio, { once: true });
    document.addEventListener("keydown", enableAudio, { once: true });
    document.addEventListener("touchstart", enableAudio, { once: true });

    return () => {
      document.removeEventListener("click", enableAudio);
      document.removeEventListener("keydown", enableAudio);
      document.removeEventListener("touchstart", enableAudio);
    };
  }, []);

  const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

  const timelineMaxWidth = useMemo(() => {
    const numericYearGap = Number.parseFloat(YEAR_GAP);
    if (!Number.isFinite(numericYearGap)) {
      return null;
    }

    const cellHeight =
      (YEAR_CANVAS_HEIGHT - (DAYS_IN_LONGEST_MONTH - 1) * ROW_GAP) / DAYS_IN_LONGEST_MONTH;
    const yearWidth = cellHeight * MONTHS_IN_YEAR + (MONTHS_IN_YEAR - 1) * MONTH_GAP;
    const totalWidth = yearWidth * years.length + numericYearGap * Math.max(0, years.length - 1);

    if (!Number.isFinite(totalWidth)) {
      return null;
    }

    return Math.ceil(totalWidth * TIMELINE_WIDTH_MULTIPLIER);
  }, [years.length]);

  const timelineInlineStyle = timelineMaxWidth
    ? { width: "100%", maxWidth: `${timelineMaxWidth}px`, margin: "0 auto" }
    : { margin: "0 auto" };

  const {
    visible: megaOverlayVisible,
    year: megaOverlayYear,
    position: megaOverlayPosition,
    activeYearIndex,
    open: openMegaOverlay,
    close: closeMegaOverlay,
    scheduleHide: scheduleMegaOverlayHide,
    cancelHide: cancelMegaOverlayHide,
    pointerEnteredOverlay,
    pointerLeftOverlay,
  } = useMegaOverlayState({
    containerRef,
    years,
    onClose: () => {
      setHoveredDate(null);
    },
  });
  const selectedYearEl = selectedDate ? new Date(selectedDate).getFullYear() : null;

  // Track pending touch event to forward to overlay when it mounts
  const pendingTouchEventRef = useRef<React.TouchEvent<HTMLDivElement> | null>(null);

  // Track which year overlay is currently open (independent of hoveredDate)

  // Derive the hovered year index from hoveredDate or active overlay
  const hoveredYearIndexFromDate = hoveredDate
    ? new Date(hoveredDate).getFullYear() - START_YEAR
    : null;
  const hoveredYearIndex = activeYearIndex ?? hoveredYearIndexFromDate;

  const isTouchLike = isTouchLikeInteraction(interactionMode);

  // Calculate start and end months for partial year rendering
  const getYearMonthRange = (year: number) => {
    if (year === START_YEAR) {
      // Start year (2000) starts from November (month 10, 0-based)
      return { startMonth: 10, endMonth: 11 };
    } else if (year === END_YEAR) {
      // End year (current year) ends at current month
      return { startMonth: 0, endMonth: now.getMonth() };
    } else {
      // Full years in between
      return { startMonth: 0, endMonth: 11 };
    }
  };

  const handleYearHover = useCallback(
    (yearIndex: number) => {
      cancelMegaOverlayHide();
      openMegaOverlay(yearIndex);
      markUserInteracted();
    },
    [cancelMegaOverlayHide, openMegaOverlay, markUserInteracted]
  );

  const handleYearLeave = () => {
    scheduleMegaOverlayHide(150);
  };

  // Forward pending touch to overlay when it becomes available
  useEffect(() => {
    if (megaOverlayVisible && megaOverlayRef.current && pendingTouchEventRef.current) {
      megaOverlayRef.current.handleExternalTouchStart(pendingTouchEventRef.current);
      pendingTouchEventRef.current = null;
    }
  }, [megaOverlayVisible]);

  // Simple touch handler that immediately opens overlay and hands off the touch
  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (event.touches.length === 0) return;

      registerInteractionMode("touch");

      const touch = event.touches[0];
      const yearIndex = getYearIndexFromPoint(touch.clientX, touch.clientY);

      if (yearIndex !== null) {
        // Store the touch event to forward after overlay renders
        pendingTouchEventRef.current = event;

        // Open the overlay - useEffect will forward the touch
        openMegaOverlay(yearIndex);
        updateScrollIndicators();
        markUserInteracted();
      }
    },
    [
      getYearIndexFromPoint,
      markUserInteracted,
      openMegaOverlay,
      registerInteractionMode,
      updateScrollIndicators,
    ]
  );

  const handleMegaOverlayMouseEnter = () => {
    registerInteractionMode("mouse");
    pointerEnteredOverlay();
    markUserInteracted();
  };

  const handleMegaOverlayMouseLeave = () => {
    pointerLeftOverlay(100);
  };

  const updateActiveYearFromPointer = useCallback(() => {
    const pointer = pointerPositionRef.current;
    if (!pointer) {
      return;
    }

    const { x, y } = pointer;
    if (x == null || y == null) {
      return;
    }

    const yearIndex = getYearIndexFromPoint(x, y);
    if (yearIndex === null) {
      return;
    }

    if (activeYearIndex === yearIndex) {
      return;
    }

    cancelMegaOverlayHide();
    openMegaOverlay(yearIndex, { preservePosition: true });
    markUserInteracted();
  }, [
    activeYearIndex,
    cancelMegaOverlayHide,
    getYearIndexFromPoint,
    markUserInteracted,
    openMegaOverlay,
  ]);

  const handleYearsScroll = useCallback(() => {
    updateScrollIndicators();
    markUserInteracted();
    updateActiveYearFromPointer();
  }, [markUserInteracted, updateActiveYearFromPointer, updateScrollIndicators]);

  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (shouldIgnoreMouseEvents()) {
        return;
      }

      registerInteractionMode("mouse");
      handleMouseUp();
    };

    const handleWindowBlur = () => {
      handleMouseUp();
    };

    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [handleMouseUp, registerInteractionMode, shouldIgnoreMouseEvents]);

  return (
    <>
      <div
        className={`${styles.yearsTimeline} ${!showTimelineYears ? styles.isCollapsed : ""}`}
        ref={containerRef}
        style={timelineInlineStyle}
        onMouseDownCapture={handleMouseDown}
        onMouseMoveCapture={handleMouseMove}
        onMouseUpCapture={handleMouseUp}
        onMouseLeave={() => {
          handleMouseLeave();
          // Stop audio playback when mouse leaves the container
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
        }}
        onTouchStart={handleTouchStart}
      >
        {showTimelineYears && scrollIndicators.isScrollable && (
          <>
            {scrollIndicators.canScrollLeft && (
              <div className={`${styles.scrollIndicator} ${styles.scrollIndicatorLeft}`}>
                <ScrollIndicatorArrow direction="left" />
              </div>
            )}
            {scrollIndicators.canScrollRight && (
              <div className={`${styles.scrollIndicator} ${styles.scrollIndicatorRight}`}>
                <ScrollIndicatorArrow direction="right" />
              </div>
            )}
          </>
        )}
        <div
          className={styles.yearsScrollContainer}
          ref={yearsScrollContainerRef}
          onScroll={handleYearsScroll}
        >
          <div
            className={styles.years}
            style={{ gap: YEAR_GAP }}
            onMouseLeave={() => {
              scheduleMegaOverlayHide(50);
            }}
          >
            {years.map((year, index) => {
              const monthRange = getYearMonthRange(year);
              return (
                <YearCanvas
                  key={year}
                  year={year}
                  index={index}
                  isActive={hoveredYearIndex === index}
                  isSelected={selectedYearEl === year}
                  highlights={highlights}
                  onYearHover={handleYearHover}
                  onYearLeave={handleYearLeave}
                  forceRedraw={forceRedrawCounter}
                  startMonth={monthRange.startMonth}
                  endMonth={monthRange.endMonth}
                  selectedDate={selectedDate}
                />
              );
            })}
          </div>
          {/* Mouse hint overlay - appears after 4 seconds of no interaction */}
          {showMouseHint && (
            <div className={`${mouseHintStyles.mouseHintOverlay} ${mouseHintStyles.visible}`}>
              <div
                className={`${mouseHintStyles.mouseHintSvg} ${isTouchLike ? mouseHintStyles.touch : ""}`}
              />
            </div>
          )}
        </div>
        {showTimelineYears && (
          <HighlightData
            onCloseMegaOverlay={() => {
              closeMegaOverlay();
              setHoveredDate(null);
            }}
          />
        )}

        {/* Mega Overlay */}
        {megaOverlayVisible && megaOverlayYear && activeYearIndex !== null && (
          <MegaYearOverlay
            ref={megaOverlayRef}
            year={megaOverlayYear}
            yearIndex={activeYearIndex}
            position={megaOverlayPosition}
            highlights={highlights}
            onMouseEnter={handleMegaOverlayMouseEnter}
            onMouseLeave={handleMegaOverlayMouseLeave}
            onSwitchToAdjacentYear={handleYearHover}
            forceRedraw={forceRedrawCounter}
            startMonth={getYearMonthRange(megaOverlayYear).startMonth}
            endMonth={getYearMonthRange(megaOverlayYear).endMonth}
            selectedDate={selectedDate}
            interactionMode={interactionMode}
            onInteractionModeChange={registerInteractionMode}
            parentContainerRef={containerRef}
            onPointerUpdate={handleOverlayPointerUpdate}
            scrollContainerRef={yearsScrollContainerRef}
            onRequestClose={closeMegaOverlay}
          />
        )}
      </div>

      {/* Hidden audio element for playing communication first recordings */}
      <audio ref={audioRef} preload="none" style={{ display: "none" }}>
        <track kind="captions" srcLang="en" label="English" default />
      </audio>
    </>
  );
};

export default TimelineYears2;
export { COLORS };

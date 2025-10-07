import React, { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import styles from "./timelineYears.module.css";
import mouseHintStyles from "./mouseHint.module.css";
import { useStateToggle } from "../../store/hooks/useStateToggle";
import { useStateHover } from "../../store/hooks/useStateHover";
import HighlightData from "./subcomponents/highlightData";
import YearCanvas, { COLORS } from "./subcomponents/yearCanvas";
import MegaYearOverlay from "./subcomponents/megaYearOverlay";
import { useAutoEdgeScroll } from "./hooks/useAutoEdgeScroll";

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
  open: (yearIndex: number) => void;
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
    (yearIndex: number) => {
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
      setPosition({ left, top, width: overlayWidth });
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

// ---------------------------------------------------------------------------
// Local pointer handling
// ---------------------------------------------------------------------------

type Point = { x: number; y: number };

type UseTimelinePointerOptions = {
  yearsScrollContainerRef: RefObject<HTMLDivElement>;
  touchDragActiveRef: MutableRefObject<boolean>;
  isTouchDevice: boolean;
  markUserInteracted: () => void;
  stopAutoScroll: () => void;
  updateEdgeScrollFromPointer: (clientX: number, hasActivePointer: boolean) => void;
};

type UseTimelinePointerResult = {
  pointerPositionRef: MutableRefObject<Point | null>;
  updateAutoScrollFromPointer: (clientX: number) => void;
  handleMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseUp: () => void;
  handleMouseLeave: () => void;
};

const useTimelinePointer = ({
  yearsScrollContainerRef,
  touchDragActiveRef,
  isTouchDevice,
  markUserInteracted,
  stopAutoScroll,
  updateEdgeScrollFromPointer,
}: UseTimelinePointerOptions): UseTimelinePointerResult => {
  const pointerDownRef = useRef(false);
  const pointerPositionRef = useRef<Point | null>(null);

  const updateAutoScrollFromPointer = useCallback(
    (clientX: number) => {
      const hasActivePointer =
        touchDragActiveRef.current || pointerDownRef.current || pointerPositionRef.current !== null;

      updateEdgeScrollFromPointer(clientX, hasActivePointer);
    },
    [touchDragActiveRef, updateEdgeScrollFromPointer]
  );

  const isFromScrollContainer = useCallback(
    (eventTarget: EventTarget | null) => {
      const container = yearsScrollContainerRef.current;
      if (!container || !(eventTarget instanceof Node)) {
        return false;
      }
      return container.contains(eventTarget);
    },
    [yearsScrollContainerRef]
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isTouchDevice) return;
      if (event.button !== 0) return;

      const fromScrollContainer = isFromScrollContainer(event.target);

      pointerDownRef.current = true;
      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
      updateAutoScrollFromPointer(event.clientX);

      if (fromScrollContainer) {
        markUserInteracted();
      }
    },
    [isTouchDevice, isFromScrollContainer, markUserInteracted, updateAutoScrollFromPointer]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isTouchDevice) return;

      const fromScrollContainer = isFromScrollContainer(event.target);

      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
      updateAutoScrollFromPointer(event.clientX);

      if (fromScrollContainer) {
        markUserInteracted();
      }
    },
    [isTouchDevice, isFromScrollContainer, markUserInteracted, updateAutoScrollFromPointer]
  );

  const handleMouseUp = useCallback(() => {
    if (isTouchDevice) return;

    pointerDownRef.current = false;
    pointerPositionRef.current = null;
    stopAutoScroll();
  }, [isTouchDevice, stopAutoScroll]);

  const handleMouseLeave = useCallback(() => {
    if (!pointerDownRef.current) {
      stopAutoScroll();
    }
    pointerPositionRef.current = null;
  }, [stopAutoScroll]);

  return useMemo(
    () => ({
      pointerPositionRef,
      updateAutoScrollFromPointer,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleMouseLeave,
    }),
    [
      handleMouseDown,
      handleMouseLeave,
      handleMouseMove,
      handleMouseUp,
      pointerPositionRef,
      updateAutoScrollFromPointer,
    ]
  );
};

// ---------------------------------------------------------------------------
// Local touch handling
// ---------------------------------------------------------------------------

type TouchInfo = {
  clientX: number;
  clientY: number;
  identifier?: number;
};

type InitialOverlayTouch = TouchInfo & { sequence: number };

type TouchEventLike = React.Touch | Touch;

type GetYearIndexFromPoint = (clientX: number, clientY: number) => number | null;

type UseTimelineTouchOptions = {
  yearsScrollContainerRef: RefObject<HTMLDivElement>;
  pointerPositionRef: MutableRefObject<Point | null>;
  touchDragActiveRef: MutableRefObject<boolean>;
  updateAutoScrollFromPointer: (clientX: number) => void;
  getYearIndexFromPoint: GetYearIndexFromPoint;
  handleYearHover: (yearIndex: number) => void;
  markUserInteracted: () => void;
  stopAutoScroll: () => void;
  megaOverlayVisible: boolean;
};

type UseTimelineTouchResult = {
  touchCursorPosition: Point | null;
  initialOverlayTouch: InitialOverlayTouch | null;
  handleTouchStart: (event: React.TouchEvent<HTMLDivElement>) => void;
  handleTouchMove: (event: React.TouchEvent<HTMLDivElement>) => void;
  handleTouchEnd: () => void;
  handleTouchCancel: () => void;
};

const useTimelineTouch = ({
  yearsScrollContainerRef,
  pointerPositionRef,
  touchDragActiveRef,
  updateAutoScrollFromPointer,
  getYearIndexFromPoint,
  handleYearHover,
  markUserInteracted,
  stopAutoScroll,
  megaOverlayVisible,
}: UseTimelineTouchOptions): UseTimelineTouchResult => {
  const touchStartPositionRef = useRef<Point | null>(null);
  const lastTouchYearIndexRef = useRef<number | null>(null);
  const lastTouchInfoRef = useRef<TouchInfo | null>(null);
  const overlayVisibilityRef = useRef(false);
  const [touchCursorPosition, setTouchCursorPosition] = useState<Point | null>(null);
  const [initialOverlayTouch, setInitialOverlayTouch] = useState<InitialOverlayTouch | null>(null);

  const updateHoverFromTouch = useCallback(
    (touch: TouchEventLike) => {
      const yearIndex = getYearIndexFromPoint(touch.clientX, touch.clientY);
      if (yearIndex !== null) {
        if (lastTouchYearIndexRef.current !== yearIndex) {
          lastTouchYearIndexRef.current = yearIndex;
          handleYearHover(yearIndex);
        }
      }

      setTouchCursorPosition({ x: touch.clientX, y: touch.clientY });
      pointerPositionRef.current = { x: touch.clientX, y: touch.clientY };
      updateAutoScrollFromPointer(touch.clientX);
      lastTouchInfoRef.current = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        identifier: "identifier" in touch ? touch.identifier : undefined,
      };
    },
    [getYearIndexFromPoint, handleYearHover, pointerPositionRef, updateAutoScrollFromPointer]
  );

  const isEventFromScrollContainer = useCallback(
    (eventTarget: EventTarget | null) => {
      const container = yearsScrollContainerRef.current;
      if (!container || !(eventTarget instanceof Node)) {
        return false;
      }
      return container.contains(eventTarget);
    },
    [yearsScrollContainerRef]
  );

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (event.touches.length === 0) return;

      const isFromScrollContainer = isEventFromScrollContainer(event.target);

      touchDragActiveRef.current = true;
      const touch = event.touches[0];
      touchStartPositionRef.current = { x: touch.clientX, y: touch.clientY };
      updateHoverFromTouch(touch);

      if (isFromScrollContainer) {
        markUserInteracted();
      }
    },
    [isEventFromScrollContainer, markUserInteracted, touchDragActiveRef, updateHoverFromTouch]
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!touchDragActiveRef.current || event.touches.length === 0) return;

      const isFromScrollContainer = isEventFromScrollContainer(event.target);

      const touch = event.touches[0];
      const startPosition = touchStartPositionRef.current;
      if (startPosition) {
        const deltaX = Math.abs(touch.clientX - startPosition.x);
        const deltaY = Math.abs(touch.clientY - startPosition.y);
        const nativeEvent = event.nativeEvent;
        if (deltaX > deltaY && nativeEvent.cancelable && !nativeEvent.defaultPrevented) {
          nativeEvent.preventDefault();
        }
      }

      updateHoverFromTouch(touch);

      if (isFromScrollContainer) {
        markUserInteracted();
      }
    },
    [isEventFromScrollContainer, markUserInteracted, touchDragActiveRef, updateHoverFromTouch]
  );

  const resetTouchState = useCallback(() => {
    touchDragActiveRef.current = false;
    setTouchCursorPosition(null);
    pointerPositionRef.current = null;
    touchStartPositionRef.current = null;
    lastTouchInfoRef.current = null;
    lastTouchYearIndexRef.current = null;
    setInitialOverlayTouch(null);
  }, [pointerPositionRef, touchDragActiveRef]);

  const handleTouchEnd = useCallback(() => {
    resetTouchState();
    stopAutoScroll();
  }, [resetTouchState, stopAutoScroll]);

  const handleTouchCancel = useCallback(() => {
    resetTouchState();
    stopAutoScroll();
  }, [resetTouchState, stopAutoScroll]);

  useEffect(() => {
    const wasVisible = overlayVisibilityRef.current;
    if (megaOverlayVisible && !wasVisible) {
      if (touchDragActiveRef.current && lastTouchInfoRef.current) {
        setInitialOverlayTouch({
          clientX: lastTouchInfoRef.current.clientX,
          clientY: lastTouchInfoRef.current.clientY,
          identifier: lastTouchInfoRef.current.identifier,
          sequence: Date.now(),
        });
      } else {
        setInitialOverlayTouch(null);
      }
    } else if (!megaOverlayVisible && wasVisible) {
      setInitialOverlayTouch(null);
    }
    overlayVisibilityRef.current = megaOverlayVisible;
  }, [megaOverlayVisible, touchDragActiveRef]);

  return useMemo(
    () => ({
      touchCursorPosition,
      initialOverlayTouch,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      handleTouchCancel,
    }),
    [
      handleTouchCancel,
      handleTouchEnd,
      handleTouchMove,
      handleTouchStart,
      initialOverlayTouch,
      touchCursorPosition,
    ]
  );
};

// Configure dayjs to use UTC plugin
dayjs.extend(utc);

// Dynamic year calculation based on current date (like the old timeline system)
const now = new Date();
const START_YEAR = 2000; // Fixed start from November 2000
const END_YEAR = now.getFullYear(); // Dynamic end year
const YEAR_GAP = "2px"; // done in css

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
  const touchDragActiveRef = useRef(false);
  const { updateFromPointer: updateEdgeScrollFromPointer, stop: stopAutoScroll } =
    useAutoEdgeScroll(yearsScrollContainerRef, { isEnabled: showTimelineYears });

  // Mouse hint state - shows after 4 seconds of no interaction
  const { showHint: showMouseHint, markInteracted: markUserInteracted } =
    useMouseHint(showTimelineYears);

  // Detect if device supports touch (using ref to avoid recalculating on every render)
  const isTouchDeviceRef = useRef(
    typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)
  );
  const isTouchDevice = isTouchDeviceRef.current;

  const {
    pointerPositionRef,
    updateAutoScrollFromPointer,
    handleMouseDown: handleTimelineMouseDown,
    handleMouseMove: handleTimelineMouseMove,
    handleMouseUp: handleTimelineMouseUp,
    handleMouseLeave: handleTimelineMouseLeave,
  } = useTimelinePointer({
    yearsScrollContainerRef,
    touchDragActiveRef,
    isTouchDevice,
    markUserInteracted,
    stopAutoScroll,
    updateEdgeScrollFromPointer,
  });

  // Audio refs and state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

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

  // Track which year overlay is currently open (independent of hoveredDate)

  // Derive the hovered year index from hoveredDate or active overlay
  const hoveredYearIndexFromDate = hoveredDate
    ? new Date(hoveredDate).getFullYear() - START_YEAR
    : null;
  const hoveredYearIndex = activeYearIndex ?? hoveredYearIndexFromDate;

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

  const handleMegaOverlayMouseEnter = () => {
    pointerEnteredOverlay();
    markUserInteracted();
  };

  const handleMegaOverlayMouseLeave = () => {
    pointerLeftOverlay(100);
  };

  const updateHoverForPointerPosition = useCallback(() => {
    const pointer = pointerPositionRef.current;
    if (!pointer) return;

    const yearIndex = getYearIndexFromPoint(pointer.x, pointer.y);
    if (yearIndex === null) return;

    // Only update if the year changed (avoid redundant updates)
    if (hoveredYearIndex !== yearIndex) {
      handleYearHover(yearIndex);
    }
  }, [getYearIndexFromPoint, handleYearHover, hoveredYearIndex, pointerPositionRef]);

  const handleYearsScroll = useCallback(() => {
    updateHoverForPointerPosition();
    markUserInteracted();
  }, [updateHoverForPointerPosition, markUserInteracted]);

  const {
    touchCursorPosition,
    initialOverlayTouch,
    handleTouchStart: handleTimelineTouchStart,
    handleTouchMove: handleTimelineTouchMove,
    handleTouchEnd: handleTimelineTouchEnd,
    handleTouchCancel: handleTimelineTouchCancel,
  } = useTimelineTouch({
    yearsScrollContainerRef,
    pointerPositionRef,
    touchDragActiveRef,
    updateAutoScrollFromPointer,
    getYearIndexFromPoint,
    handleYearHover,
    markUserInteracted,
    stopAutoScroll,
    megaOverlayVisible,
  });

  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (isTouchDevice) return;
      handleTimelineMouseUp();
      handleTimelineTouchCancel();
    };

    const handleWindowBlur = () => {
      handleTimelineMouseUp();
      handleTimelineTouchCancel();
    };

    const handleWindowTouchEnd = () => {
      handleTimelineTouchEnd();
    };

    if (!isTouchDevice) {
      window.addEventListener("mouseup", handleWindowMouseUp);
    }
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("touchend", handleWindowTouchEnd);
    window.addEventListener("touchcancel", handleWindowTouchEnd);

    return () => {
      if (!isTouchDevice) {
        window.removeEventListener("mouseup", handleWindowMouseUp);
      }
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("touchend", handleWindowTouchEnd);
      window.removeEventListener("touchcancel", handleWindowTouchEnd);
    };
  }, [handleTimelineMouseUp, handleTimelineTouchCancel, handleTimelineTouchEnd, isTouchDevice]);

  return (
    <>
      <div
        className={`${styles.yearsTimeline} ${!showTimelineYears ? styles.isCollapsed : ""}`}
        ref={containerRef}
        onMouseDownCapture={handleTimelineMouseDown}
        onMouseMoveCapture={handleTimelineMouseMove}
        onMouseUpCapture={handleTimelineMouseUp}
        onMouseLeave={() => {
          handleTimelineMouseLeave();
          // Stop audio playback when mouse leaves the container
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
        }}
        onTouchStart={handleTimelineTouchStart}
        onTouchMove={handleTimelineTouchMove}
        onTouchEnd={handleTimelineTouchEnd}
        onTouchCancel={handleTimelineTouchCancel}
      >
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
                className={`${mouseHintStyles.mouseHintSvg} ${isTouchDevice ? mouseHintStyles.touch : ""}`}
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
            externalCursorPosition={touchCursorPosition}
            initialTouch={initialOverlayTouch}
            isTouchDevice={isTouchDevice}
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

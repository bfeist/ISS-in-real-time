import React, { useCallback, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import styles from "./timelineYears.module.css";
import mouseHintStyles from "./mouseHint.module.css";
import { useStateToggle } from "../../store/hooks/useStateToggle";
import { useStateHover } from "../../store/hooks/useStateHover";
import HighlightData from "./subcomponents/highlightData";
import YearCanvas, { COLORS } from "./subcomponents/yearCanvas";
import MegaYearOverlay from "./subcomponents/megaYearOverlay";

// Configure dayjs to use UTC plugin
dayjs.extend(utc);

// Dynamic year calculation based on current date (like the old timeline system)
const now = new Date();
const START_YEAR = 2000; // Fixed start from November 2000
const END_YEAR = now.getFullYear(); // Dynamic end year
const YEAR_GAP = "2px"; // done in css
const BASE_EDGE_SCROLL_ZONE_PX = 160; // Width of activation zone near edges for auto-scroll on wide screens
const NARROW_SCREEN_EDGE_SCROLL_ZONE_PX = 64; // Narrow edge zone for small screens to prevent accidental scroll
const NARROW_SCREEN_MAX_WIDTH = 500; // px breakpoint for treating screen as narrow
const MIN_SCROLL_SPEED_PX_PER_SEC = 120; // Slowest automatic scroll speed
const MAX_SCROLL_SPEED_PX_PER_SEC = 800; // Fastest automatic scroll speed

const getEdgeScrollZonePx = () => {
  if (typeof window === "undefined") {
    return BASE_EDGE_SCROLL_ZONE_PX;
  }

  return window.innerWidth <= NARROW_SCREEN_MAX_WIDTH
    ? NARROW_SCREEN_EDGE_SCROLL_ZONE_PX
    : BASE_EDGE_SCROLL_ZONE_PX;
};

type AutoScrollState = {
  isActive: boolean;
  direction: number;
  speed: number;
  frameId: number;
  lastTimestamp: number;
};

// Props interface for the TimelineYears2 component
interface TimelineYears2Props {
  highlights: Map<string, { fill: string; stroke?: string }>;
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
  const pointerDownRef = useRef(false);
  const pointerPositionRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollStateRef = useRef<AutoScrollState>({
    isActive: false,
    direction: 0,
    speed: 0,
    frameId: 0,
    lastTimestamp: 0,
  });

  // Mouse hint state - shows after 4 seconds of no interaction
  const [showMouseHint, setShowMouseHint] = useState(false);
  const mouseHintTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasUserInteractedWithTimelineRef = useRef(false);

  // Detect if device supports touch (using ref to avoid recalculating on every render)
  const isTouchDeviceRef = useRef(
    typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)
  );
  const isTouchDevice = isTouchDeviceRef.current;

  const stopAutoScroll = useCallback(() => {
    const state = autoScrollStateRef.current;
    if (state.frameId) {
      cancelAnimationFrame(state.frameId);
    }
    state.frameId = 0;
    state.isActive = false;
    state.direction = 0;
    state.speed = 0;
    state.lastTimestamp = 0;
  }, []);

  // Function to mark that user has interacted and permanently disable the hint
  const markUserInteracted = useCallback(() => {
    hasUserInteractedWithTimelineRef.current = true;

    // Clear any pending timer
    if (mouseHintTimerRef.current) {
      clearTimeout(mouseHintTimerRef.current);
      mouseHintTimerRef.current = null;
    }

    // Hide the hint immediately
    setShowMouseHint(false);
  }, []);

  const autoScrollStep = useCallback(
    (timestamp: number) => {
      const container = yearsScrollContainerRef.current;
      const state = autoScrollStateRef.current;

      if (!container || !state.isActive) {
        stopAutoScroll();
        return;
      }

      if (state.lastTimestamp === 0) {
        state.lastTimestamp = timestamp;
        if (state.isActive) {
          state.frameId = requestAnimationFrame(autoScrollStep);
        }
        return;
      }

      const delta = timestamp - state.lastTimestamp;
      state.lastTimestamp = timestamp;

      const distance = (state.speed * delta) / 1000;
      if (distance <= 0 || state.direction === 0) {
        stopAutoScroll();
        return;
      }

      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 0) {
        stopAutoScroll();
        return;
      }

      const previousScrollLeft = container.scrollLeft;
      const targetScrollLeft = previousScrollLeft + state.direction * distance;
      const clampedScrollLeft = Math.min(Math.max(targetScrollLeft, 0), maxScrollLeft);
      container.scrollLeft = clampedScrollLeft;

      const reachedStart = state.direction < 0 && clampedScrollLeft <= 0;
      const reachedEnd = state.direction > 0 && clampedScrollLeft >= maxScrollLeft;

      if (reachedStart || reachedEnd) {
        stopAutoScroll();
        return;
      }

      if (!state.isActive) {
        return;
      }

      state.frameId = requestAnimationFrame(autoScrollStep);
    },
    [stopAutoScroll]
  );

  const startAutoScroll = useCallback(
    (direction: number, speed: number) => {
      const container = yearsScrollContainerRef.current;
      if (!container || direction === 0 || speed <= 0) {
        stopAutoScroll();
        return;
      }

      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 0) {
        stopAutoScroll();
        return;
      }

      const normalizedDirection = Math.sign(direction);
      if (normalizedDirection === 0) {
        stopAutoScroll();
        return;
      }

      if (normalizedDirection < 0 && container.scrollLeft <= 0) {
        stopAutoScroll();
        return;
      }

      if (normalizedDirection > 0 && container.scrollLeft >= maxScrollLeft) {
        stopAutoScroll();
        return;
      }

      const state = autoScrollStateRef.current;
      state.direction = normalizedDirection;
      state.speed = speed;

      if (!state.isActive) {
        state.isActive = true;
        state.lastTimestamp = 0;
        state.frameId = requestAnimationFrame(autoScrollStep);
      }
    },
    [autoScrollStep, stopAutoScroll]
  );

  const updateAutoScrollFromPointer = useCallback(
    (clientX: number) => {
      const container = yearsScrollContainerRef.current;
      if (!container) return;

      if (!showTimelineYears) {
        stopAutoScroll();
        return;
      }

      const hasActivePointer =
        touchDragActiveRef.current || pointerDownRef.current || pointerPositionRef.current !== null;
      if (!hasActivePointer) {
        stopAutoScroll();
        return;
      }

      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 0) {
        stopAutoScroll();
        return;
      }

      const rect = container.getBoundingClientRect();
      const effectiveEdgeZone = Math.min(getEdgeScrollZonePx(), rect.width / 2);
      if (effectiveEdgeZone <= 0) {
        stopAutoScroll();
        return;
      }

      const distanceToLeft = clientX - rect.left;
      const distanceToRight = rect.right - clientX;
      const withinLeftZone =
        distanceToLeft >= -effectiveEdgeZone && distanceToLeft <= effectiveEdgeZone;
      const withinRightZone =
        distanceToRight >= -effectiveEdgeZone && distanceToRight <= effectiveEdgeZone;

      if (!withinLeftZone && !withinRightZone) {
        stopAutoScroll();
        return;
      }

      const distanceWithinZone = withinLeftZone
        ? Math.max(0, Math.min(distanceToLeft, effectiveEdgeZone))
        : Math.max(0, Math.min(distanceToRight, effectiveEdgeZone));

      const proximityFactor = 1 - distanceWithinZone / effectiveEdgeZone;

      const speed =
        MIN_SCROLL_SPEED_PX_PER_SEC +
        (MAX_SCROLL_SPEED_PX_PER_SEC - MIN_SCROLL_SPEED_PX_PER_SEC) * proximityFactor;

      const direction = withinLeftZone ? -1 : 1;
      startAutoScroll(direction, speed);
    },
    [showTimelineYears, startAutoScroll, stopAutoScroll]
  );

  const handleTimelineMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      // Only mark as interacted if the event originated from yearsScrollContainer
      const isFromScrollContainer = yearsScrollContainerRef.current?.contains(event.target as Node);

      pointerDownRef.current = true;
      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
      updateAutoScrollFromPointer(event.clientX);

      if (isFromScrollContainer) {
        markUserInteracted();
      }
    },
    [updateAutoScrollFromPointer, markUserInteracted]
  );

  const handleTimelineMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Only mark as interacted if the event originated from yearsScrollContainer
      const isFromScrollContainer = yearsScrollContainerRef.current?.contains(event.target as Node);

      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
      updateAutoScrollFromPointer(event.clientX);

      if (isFromScrollContainer) {
        markUserInteracted();
      }
    },
    [updateAutoScrollFromPointer, markUserInteracted]
  );

  const handleTimelineMouseUp = useCallback(() => {
    pointerDownRef.current = false;
    pointerPositionRef.current = null;
    stopAutoScroll();
  }, [stopAutoScroll]);

  const handleTimelineMouseLeave = useCallback(() => {
    if (!pointerDownRef.current) {
      stopAutoScroll();
    }
    pointerPositionRef.current = null;
  }, [stopAutoScroll]);

  // Audio refs and state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Overlay state
  const [megaOverlayVisible, setMegaOverlayVisible] = useState(false);
  const [megaOverlayYear, setMegaOverlayYear] = useState<number | null>(null);
  const [megaOverlayPosition, setMegaOverlayPosition] = useState({ left: 0, top: 0, width: 0 });
  const isOverMegaOverlayRef = useRef(false);
  const hideOverlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchDragActiveRef = useRef(false);
  const touchStartPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastTouchYearIndexRef = useRef<number | null>(null);
  const [touchCursorPosition, setTouchCursorPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const lastTouchInfoRef = useRef<{ clientX: number; clientY: number; identifier?: number } | null>(
    null
  );
  const [initialOverlayTouch, setInitialOverlayTouch] = useState<{
    clientX: number;
    clientY: number;
    identifier?: number;
    sequence: number;
  } | null>(null);
  const overlayVisibilityRef = useRef(false);

  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (pointerDownRef.current) {
        pointerDownRef.current = false;
        stopAutoScroll();
      }
      pointerPositionRef.current = null;
      touchStartPositionRef.current = null;
      lastTouchInfoRef.current = null;
      setInitialOverlayTouch(null);
    };

    const handleWindowBlur = () => {
      pointerDownRef.current = false;
      touchDragActiveRef.current = false;
      stopAutoScroll();
      setTouchCursorPosition(null);
      pointerPositionRef.current = null;
      touchStartPositionRef.current = null;
    };

    const handleWindowTouchEnd = () => {
      touchDragActiveRef.current = false;
      stopAutoScroll();
      setTouchCursorPosition(null);
      pointerPositionRef.current = null;
      touchStartPositionRef.current = null;
      lastTouchInfoRef.current = null;
      setInitialOverlayTouch(null);
    };

    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("touchend", handleWindowTouchEnd);
    window.addEventListener("touchcancel", handleWindowTouchEnd);

    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("touchend", handleWindowTouchEnd);
      window.removeEventListener("touchcancel", handleWindowTouchEnd);
    };
  }, [setTouchCursorPosition, stopAutoScroll]);

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

  // Initialize mouse hint timer when timeline becomes visible
  useEffect(() => {
    // Clear any existing timer
    if (mouseHintTimerRef.current) {
      clearTimeout(mouseHintTimerRef.current);
      mouseHintTimerRef.current = null;
    }

    if (showTimelineYears && !hasUserInteractedWithTimelineRef.current) {
      // Start a new timer to show the hint after 4 seconds
      mouseHintTimerRef.current = setTimeout(() => {
        setShowMouseHint(true);
      }, 4000);
    } else {
      // Hide hint when timeline is hidden
      setShowMouseHint(false);
    }

    // Cleanup on unmount
    return () => {
      if (mouseHintTimerRef.current) {
        clearTimeout(mouseHintTimerRef.current);
        mouseHintTimerRef.current = null;
      }
    };
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
  const selectedYearEl = selectedDate ? new Date(selectedDate).getFullYear() : null;

  // Track which year overlay is currently open (independent of hoveredDate)
  const [activeOverlayYearIndex, setActiveOverlayYearIndex] = useState<number | null>(null);

  // Derive the hovered year index from hoveredDate or active overlay
  const hoveredYearIndexFromDate = hoveredDate
    ? new Date(hoveredDate).getFullYear() - START_YEAR
    : null;
  const hoveredYearIndex = activeOverlayYearIndex ?? hoveredYearIndexFromDate;

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

  const showMegaOverlay = useCallback(
    (yearIndex: number) => {
      const year = years[yearIndex];

      if (!containerRef.current) return;

      // Find year elements by using a more generic selector since YearCanvas styles are in a separate module
      const yearElements = containerRef.current.querySelectorAll("[data-year-index]");
      const yearEl = yearElements[yearIndex] as HTMLElement;
      if (!yearEl) return;

      const yearsTimelineRect = containerRef.current.getBoundingClientRect();
      const yearRect = yearEl.getBoundingClientRect();

      // Position overlay to center on the year element - use 2x width
      const overlayWidth = yearRect.width * 2;
      let left;
      if (yearIndex === 0) {
        left = 0;
      } else if (yearIndex === years.length - 1) {
        left = yearsTimelineRect.width - overlayWidth;
      } else {
        left = yearRect.left - yearsTimelineRect.left + yearRect.width / 2 - overlayWidth / 2;
      }

      // Position overlay to start just below the year header, so the year title shows through
      // Slight overlap to ensure smooth mouse transition
      const yearHeaderHeight = 25; // Height of the year header
      const top = yearRect.top - yearsTimelineRect.top + yearHeaderHeight + 2;

      setMegaOverlayYear(year);
      setMegaOverlayPosition({ left, top, width: overlayWidth });
      setMegaOverlayVisible(true);
      setActiveOverlayYearIndex(yearIndex);
    },
    [years]
  );

  const handleYearHover = useCallback(
    (yearIndex: number) => {
      // Clear any pending hide timeout when hovering over a new year
      if (hideOverlayTimeoutRef.current) {
        clearTimeout(hideOverlayTimeoutRef.current);
        hideOverlayTimeoutRef.current = null;
      }

      // Just open the overlay - let overlay handle hoveredDate
      showMegaOverlay(yearIndex);
      markUserInteracted();
    },
    [showMegaOverlay, markUserInteracted]
  );

  const handleYearLeave = () => {
    // Only hide overlay if we're not over it
    // Use a longer delay to allow for smooth horizontal sliding between year headers
    hideOverlayTimeoutRef.current = setTimeout(() => {
      if (!isOverMegaOverlayRef.current) {
        setHoveredDate(null);
        setMegaOverlayVisible(false);
        setMegaOverlayYear(null);
        setActiveOverlayYearIndex(null);
      }
    }, 150); // Increased delay for smoother transitions
  };

  const handleMegaOverlayMouseEnter = () => {
    // Clear any pending hide timeout when entering overlay
    if (hideOverlayTimeoutRef.current) {
      clearTimeout(hideOverlayTimeoutRef.current);
      hideOverlayTimeoutRef.current = null;
    }
    isOverMegaOverlayRef.current = true;
    markUserInteracted();
  };

  const handleMegaOverlayMouseLeave = () => {
    isOverMegaOverlayRef.current = false;

    // Use a delay to allow transition from overlay back to year headers
    hideOverlayTimeoutRef.current = setTimeout(() => {
      // Only hide if we're truly not over any year header or overlay
      if (!isOverMegaOverlayRef.current) {
        setMegaOverlayVisible(false);
        setHoveredDate(null);
        setMegaOverlayYear(null);
        setActiveOverlayYearIndex(null);
      }
    }, 100); // Slightly shorter delay since we're checking less conditions
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
  }, [getYearIndexFromPoint, handleYearHover, hoveredYearIndex]);

  const handleYearsScroll = useCallback(() => {
    updateHoverForPointerPosition();
    markUserInteracted();
  }, [updateHoverForPointerPosition, markUserInteracted]);

  const updateHoverFromTouch = (touch: Touch | React.Touch) => {
    const yearIndex = getYearIndexFromPoint(touch.clientX, touch.clientY);
    if (yearIndex !== null) {
      // Check if we need to open a different year's overlay
      if (lastTouchYearIndexRef.current !== yearIndex && activeOverlayYearIndex !== yearIndex) {
        lastTouchYearIndexRef.current = yearIndex;
        handleYearHover(yearIndex);
      }
    }

    // Let overlay handle all hover date updates via externalCursorPosition
    setTouchCursorPosition({ x: touch.clientX, y: touch.clientY });
    pointerPositionRef.current = { x: touch.clientX, y: touch.clientY };
    updateAutoScrollFromPointer(touch.clientX);
    lastTouchInfoRef.current = {
      clientX: touch.clientX,
      clientY: touch.clientY,
      identifier: "identifier" in touch ? touch.identifier : undefined,
    };
  };

  const handleTimelineTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 0) return;

    // Only mark as interacted if the event originated from yearsScrollContainer
    const isFromScrollContainer = yearsScrollContainerRef.current?.contains(event.target as Node);

    touchDragActiveRef.current = true;
    const touch = event.touches[0];
    touchStartPositionRef.current = { x: touch.clientX, y: touch.clientY };
    updateHoverFromTouch(touch);

    if (isFromScrollContainer) {
      markUserInteracted();
    }
  };

  const handleTimelineTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchDragActiveRef.current || event.touches.length === 0) return;

    // Only mark as interacted if the event originated from yearsScrollContainer
    const isFromScrollContainer = yearsScrollContainerRef.current?.contains(event.target as Node);

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
  };

  const handleTimelineTouchEnd = () => {
    touchDragActiveRef.current = false;

    setTouchCursorPosition(null);
    pointerPositionRef.current = null;
    touchStartPositionRef.current = null;
    lastTouchInfoRef.current = null;
    setInitialOverlayTouch(null);
    stopAutoScroll();
  };

  const handleTimelineTouchCancel = () => {
    touchDragActiveRef.current = false;
    setTouchCursorPosition(null);
    pointerPositionRef.current = null;
    touchStartPositionRef.current = null;
    lastTouchInfoRef.current = null;
    setInitialOverlayTouch(null);
    stopAutoScroll();
  };

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
  }, [megaOverlayVisible]);

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
              // Only clear hovered year state if we're not moving to the mega overlay
              // Use a timeout to allow the overlay mouse events to fire first
              hideOverlayTimeoutRef.current = setTimeout(() => {
                // If we're not over the mega overlay, clear the hover state
                if (!isOverMegaOverlayRef.current) {
                  if (hideOverlayTimeoutRef.current) {
                    clearTimeout(hideOverlayTimeoutRef.current);
                    hideOverlayTimeoutRef.current = null;
                  }
                  setHoveredDate(null);
                  setMegaOverlayVisible(false);
                  setMegaOverlayYear(null);
                  setActiveOverlayYearIndex(null);
                }
              }, 50); // Small delay to allow overlay events to register
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
              setMegaOverlayVisible(false);
              setHoveredDate(null);
              setActiveOverlayYearIndex(null);
            }}
          />
        )}

        {/* Mega Overlay */}
        {megaOverlayVisible && megaOverlayYear && activeOverlayYearIndex !== null && (
          <MegaYearOverlay
            year={megaOverlayYear}
            yearIndex={activeOverlayYearIndex}
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

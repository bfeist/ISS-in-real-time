import React, { useEffect, useRef, useCallback, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import styles from "./timelineYears2.module.css";
import { useStateToggle } from "../../store/hooks/useStateToggle";
import { useStateClock } from "../../store/hooks/useStateClock";
import { useStateHover } from "../../store/hooks/useStateHover";
import SearchComponent from "./subcomponents/highlightData";
import DateTooltip from "./dateTooltip/dateTooltip";

// Configure dayjs to use UTC plugin
dayjs.extend(utc);

// Constants from the original HTML
const START_YEAR = 2000;
const END_YEAR = 2025;
const MONTH_GAP = 1;
const ROW_GAP = 1;
const YEAR_GAP = "3px"; // done in css

// Color constants
const COLORS = {
  hover: "red",
  selected: "red",
  noData: "#5b5d77ff",
  someData: "#6d7090",
  commData: "#7a7ea5ff",
  contentHighlightStroke: "#C500AB",
  transparent: "rgba(0, 0, 0, 0)",
  crewOnboard: "#E2DB00",
  satisfiesHighlights: "#d9d9d9cc",
} as const;

interface YearCanvasProps {
  year: number;
  index: number;
  isActive?: boolean;
  isSelected?: boolean;
  highlights: Map<string, { fill: string; stroke?: string }>;
  onHover?: (dateStr: string | null) => void;
  onYearHover?: (yearIndex: number) => void;
  onYearLeave?: () => void;
  forceRedraw?: number;
}

// Individual year canvas component
const YearCanvas: React.FC<YearCanvasProps> = ({
  year,
  index,
  isActive,
  isSelected,
  highlights,
  onHover,
  onYearHover,
  onYearLeave,
  forceRedraw,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContainerMouseEnter = () => {
    if (onYearHover) onYearHover(index);
  };

  const handleContainerMouseLeave = () => {
    if (onYearLeave) onYearLeave();
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Set canvas size accounting for device pixel ratio
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw calendar grid for the year
    drawYearCalendar(ctx, year, rect.width, rect.height, highlights);
  }, [year, highlights]);

  const drawYearCalendar = (
    ctx: CanvasRenderingContext2D,
    year: number,
    width: number,
    height: number,
    highlights: Map<string, { fill: string; stroke?: string }>
  ) => {
    const months = 12;
    const maxDaysInMonth = 31;
    const cellWidth = (width - (months - 1) * MONTH_GAP) / months;
    const cellHeight = (height - (maxDaysInMonth - 1) * ROW_GAP) / maxDaysInMonth; // No header offset for main calendar

    for (let month = 0; month < months; month++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const startX = month * (cellWidth + MONTH_GAP);

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const x = startX;
        const y = (day - 1) * (cellHeight + ROW_GAP); // Start from top of canvas

        // Get highlight info for this date
        const highlightInfo = highlights.get(dateStr);
        const fillColor = highlightInfo?.fill || COLORS.noData;
        const strokeColor = highlightInfo?.stroke;

        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, cellWidth, cellHeight);

        // Draw stroke if specified
        if (strokeColor) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cellWidth, cellHeight);
        }
      }
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !onHover) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Calculate which date was hovered (simplified)
    const dateStr = getDateFromCoordinates(x, y, year, rect.width, rect.height);
    onHover(dateStr);
  };

  const handleMouseLeave = () => {
    if (onHover) onHover(null);
  };

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const handleResize = () => {
      setTimeout(draw, 0);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  // Force redraw when forceRedraw prop changes (e.g., when component becomes visible)
  useEffect(() => {
    if (forceRedraw !== undefined) {
      draw();
    }
  }, [forceRedraw, draw]);

  return (
    <div
      ref={containerRef}
      className={`${styles.year} ${isActive ? styles.active : ""} ${isSelected ? styles.selected : ""}`}
      onMouseEnter={handleContainerMouseEnter}
      onMouseLeave={handleContainerMouseLeave}
    >
      <div className={styles.yearHeader}>
        <div className={styles.yearTitle}>{year}</div>
      </div>
      <div className={styles.monthsCanvas}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ width: "100%", height: "160px" }}
        />
      </div>
    </div>
  );
};

// Helper function to determine date from canvas coordinates
const getDateFromCoordinates = (
  x: number,
  y: number,
  year: number,
  width: number,
  height: number
): string | null => {
  const months = 12;
  const maxDaysInMonth = 31;
  const cellWidth = (width - (months - 1) * MONTH_GAP) / months;
  const cellHeight = (height - (maxDaysInMonth - 1) * ROW_GAP) / maxDaysInMonth;

  // Determine month
  const month = Math.floor(x / (cellWidth + MONTH_GAP));
  if (month < 0 || month >= months) return null;

  // Determine day (no header offset for main calendar)
  const day = Math.floor(y / (cellHeight + ROW_GAP)) + 1;

  // Validate day exists in this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;

  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

// Mega Overlay Component for zoomed year view
const MegaYearOverlay: React.FC<{
  year: number;
  position: { left: number; top: number; width: number };
  highlights: Map<string, { fill: string; stroke?: string }>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  forceRedraw?: number;
  showTimelineYears: boolean;
}> = ({
  year,
  position,
  highlights,
  onMouseEnter,
  onMouseLeave,
  forceRedraw,
  showTimelineYears,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [isTouchInteraction, setIsTouchInteraction] = useState(false);
  const [pendingTouchDate, setPendingTouchDate] = useState<string | null>(null);

  // Global state hooks
  const { hoveredDate, setHoveredDate } = useStateHover();
  const { setSelectedDate } = useStateClock();
  const { setShowTimelineYears } = useStateToggle();

  // Constants for mega overlay layout - make squares square
  const cellGap = 1;
  const maxDaysInMonth = 31;
  const months = 12;
  const cellWidth = (position.width - (months - 1) * cellGap) / months;
  const cellSize = cellWidth;
  const totalHeight = maxDaysInMonth * (cellSize + cellGap);

  // Handle date click using global state with touch device logic
  const handleDateClick = useCallback(
    (dateStr: string) => {
      // Check if this is a touch device
      const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

      // For touch devices, don't auto-select on click - require using the Go button
      if (isTouchDevice) {
        return;
      }

      // For mouse devices, proceed with normal click behavior
      setSelectedDate(dateStr);
    },
    [setSelectedDate]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width } = position;
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Set canvas size
    canvas.width = width * devicePixelRatio;
    canvas.height = totalHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Clear canvas with transparent background
    ctx.clearRect(0, 0, width, totalHeight);

    // Draw only the calendar grid - no labels, no headers
    for (let day = 1; day <= maxDaysInMonth; day++) {
      const y = (day - 1) * (cellSize + cellGap);

      for (let month = 0; month < months; month++) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        if (day <= daysInMonth) {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const x = month * (cellWidth + cellGap);

          // Get highlight info for this date
          const highlightInfo = highlights.get(dateStr);
          const fillColor = highlightInfo?.fill || COLORS.noData;
          const strokeColor = highlightInfo?.stroke;

          ctx.fillStyle = fillColor;
          ctx.fillRect(x, y, cellWidth, cellSize);

          // Draw stroke if specified
          if (strokeColor) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, cellWidth, cellSize);
          }

          // If this is the hovered date, draw red border
          if (dateStr === hoveredDate) {
            ctx.strokeStyle = COLORS.hover;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, cellWidth, cellSize);
          }
        }
      }
    }
  }, [year, position, highlights, cellWidth, cellSize, totalHeight, hoveredDate]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dateStr = getMegaDateFromCoordinates(x, y, year, position.width);
    setHoveredDate(dateStr);

    // Update cursor position for tooltip
    setCursorPosition({ x: event.clientX, y: event.clientY });

    // Reset touch interaction flag when mouse is used
    setIsTouchInteraction(false);
  };

  const handleTouchStart = (_event: React.TouchEvent<HTMLDivElement>) => {
    setIsTouchInteraction(true);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 0) return;

    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const touch = event.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const dateStr = getMegaDateFromCoordinates(x, y, year, position.width);
    setHoveredDate(dateStr);

    // Update cursor position for tooltip
    setCursorPosition({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (_event: React.TouchEvent<HTMLDivElement>) => {
    // Keep tooltip visible for touch interactions until explicitly cancelled
    if (!pendingTouchDate && hoveredDate) {
      setPendingTouchDate(hoveredDate);
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dateStr = getMegaDateFromCoordinates(x, y, year, position.width);
    if (dateStr) handleDateClick(dateStr);

    // close the years dropdown
    setShowTimelineYears(false);
  };

  const handleTouchGo = useCallback(() => {
    if (pendingTouchDate) {
      handleDateClick(pendingTouchDate);
      setPendingTouchDate(null);
      setIsTouchInteraction(false);
    }
  }, [pendingTouchDate, handleDateClick]);

  const handleTouchCancel = useCallback(() => {
    setPendingTouchDate(null);
    setIsTouchInteraction(false);
    setCursorPosition(null);
  }, []);

  const handleMouseLeave = () => {
    if (onMouseLeave) onMouseLeave();
    setHoveredDate(null);
    setCursorPosition(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  useEffect(() => {
    draw();
  }, [draw]);

  // Force redraw when forceRedraw prop changes (e.g., when component becomes visible)
  useEffect(() => {
    if (forceRedraw !== undefined) {
      draw();
    }
  }, [forceRedraw, draw]);

  return (
    <div
      ref={overlayRef}
      className={styles.yearOverlay}
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        height: totalHeight,
        display: "block",
        pointerEvents: "auto",
        zIndex: 10,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={onMouseEnter}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="grid"
      tabIndex={0}
      aria-label={`Calendar for ${year}`}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: `${totalHeight}px`, pointerEvents: "none" }}
      />
      {/* Date Tooltip for this overlay */}
      <DateTooltip
        hoveredDate={hoveredDate}
        cursorPosition={cursorPosition}
        isTouchInteraction={isTouchInteraction}
        showTimelineYears={showTimelineYears}
        onTouchGo={handleTouchGo}
        onTouchCancel={handleTouchCancel}
        containerRef={overlayRef}
      />
    </div>
  );
};

// Helper function for mega overlay hit detection
const getMegaDateFromCoordinates = (
  x: number,
  y: number,
  year: number,
  width: number
): string | null => {
  const cellGap = 1;
  const months = 12;

  const cellWidth = (width - (months - 1) * cellGap) / months;
  const cellSize = cellWidth;

  // Determine month
  const month = Math.floor(x / (cellWidth + cellGap));
  if (month < 0 || month >= months) return null;

  // Determine day
  const day = Math.floor(y / (cellSize + cellGap)) + 1;

  // Validate day exists in this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;

  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
  const { hoveredDate } = useStateHover();

  // State to force redraw when timeline becomes visible
  const [forceRedrawCounter, setForceRedrawCounter] = useState(0);

  // Container ref for tooltip positioning
  const containerRef = useRef<HTMLDivElement>(null);

  // Audio refs and state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Force redraw when timeline becomes visible
  useEffect(() => {
    if (showTimelineYears) {
      setForceRedrawCounter((prev) => prev + 1);
    }
  }, [showTimelineYears]);

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

  const [hoveredYearIndex, setHoveredYearIndex] = useState<number | null>(null);
  const [megaOverlayVisible, setMegaOverlayVisible] = useState(false);
  const [megaOverlayYear, setMegaOverlayYear] = useState<number | null>(null);
  const [megaOverlayPosition, setMegaOverlayPosition] = useState({ left: 0, top: 0, width: 0 });
  const [isOverMegaOverlay, setIsOverMegaOverlay] = useState(false);

  const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);
  const selectedYearEl = selectedDate ? new Date(selectedDate).getFullYear() : null;

  const handleYearHover = (yearIndex: number) => {
    setHoveredYearIndex(yearIndex);
    showMegaOverlay(yearIndex);
  };

  const handleYearLeave = () => {
    if (!isOverMegaOverlay) {
      setHoveredYearIndex(null);
      setMegaOverlayVisible(false);
    }
  };

  const handleMegaOverlayMouseEnter = () => {
    setIsOverMegaOverlay(true);
  };

  const handleMegaOverlayMouseLeave = () => {
    setIsOverMegaOverlay(false);
    setMegaOverlayVisible(false);
    setHoveredYearIndex(null);
  };

  const showMegaOverlay = (yearIndex: number) => {
    const year = years[yearIndex];

    if (!containerRef.current) return;

    const yearElements = containerRef.current.querySelectorAll(`.${styles.year}`);
    const yearEl = yearElements[yearIndex] as HTMLElement;
    if (!yearEl) return;

    const yearsTimelineRect = containerRef.current.getBoundingClientRect();
    const yearRect = yearEl.getBoundingClientRect();

    // Position overlay to center on the year element - use 2x width
    const overlayWidth = yearRect.width * 2;
    const left = yearRect.left - yearsTimelineRect.left + yearRect.width / 2 - overlayWidth / 2;

    // Position overlay to start just below the year header, so the year title shows through
    const yearHeaderHeight = 25; // Height of the year header
    const top = yearRect.top - yearsTimelineRect.top + yearHeaderHeight;

    setMegaOverlayYear(year);
    setMegaOverlayPosition({ left, top, width: overlayWidth });
    setMegaOverlayVisible(true);
  };

  return (
    <>
      <div
        className={`${styles.yearsTimeline} ${!showTimelineYears ? styles.isCollapsed : ""}`}
        ref={containerRef}
        onMouseLeave={() => {
          // Stop audio playback when mouse leaves the container
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
        }}
      >
        <div className={styles.years} style={{ gap: YEAR_GAP }}>
          {years.map((year, index) => (
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
            />
          ))}
        </div>
        <SearchComponent />

        {/* Mega Overlay */}
        {megaOverlayVisible && megaOverlayYear && (
          <MegaYearOverlay
            year={megaOverlayYear}
            position={megaOverlayPosition}
            highlights={highlights}
            onMouseEnter={handleMegaOverlayMouseEnter}
            onMouseLeave={handleMegaOverlayMouseLeave}
            forceRedraw={forceRedrawCounter}
            showTimelineYears={showTimelineYears}
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

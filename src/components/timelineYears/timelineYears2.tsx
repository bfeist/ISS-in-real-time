import React, { useEffect, useRef, useCallback, useState } from "react";
import styles from "./timelineYears2.module.css";
import { useStateToggle } from "../../store/hooks/useStateToggle";
import { useStateClock } from "../../store/hooks/useStateClock";
import SearchComponent from "./subcomponents/searchComponent";
import DateTooltip from "./subcomponents/dateTooltip/dateTooltip";

// Constants from the original HTML
const START_YEAR = 2000;
const END_YEAR = 2025;
const MONTH_GAP = 1;
const ROW_GAP = 1;
const YEAR_GAP = "3px"; // done in css

// Color constants
const COLOR = {
  gridline: "#1a2230",
  tile: "#77798B",
  tileHover: "#ffffff",
  hiYellow: "#ffd84d",
  hiCyan: "#58e0ff",
  hiGreen: "#7bff7d",
  hiPink: "#ff7bd1",
  hiOrange: "#ffb156",
};

interface YearCanvasProps {
  year: number;
  index: number;
  isActive?: boolean;
  isSelected?: boolean;
  highlights: Map<string, string>;
  onHover?: (dateStr: string | null) => void;
  onClick?: (dateStr: string) => void;
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
  onClick,
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
    highlights: Map<string, string>
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

        // Determine cell color
        const highlightColor = highlights.get(dateStr);
        const color = highlightColor || COLOR.tile;

        ctx.fillStyle = color;
        ctx.fillRect(x, y, cellWidth, cellHeight);
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

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !onClick) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dateStr = getDateFromCoordinates(x, y, year, rect.width, rect.height);
    if (dateStr) onClick(dateStr);
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
          onClick={handleClick}
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
  highlights: Map<string, string>;
  onHover?: (dateStr: string | null) => void;
  onClick?: (dateStr: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  forceRedraw?: number;
  showTimelineYears: boolean;
}> = ({
  year,
  position,
  highlights,
  onHover,
  onClick,
  onMouseEnter,
  onMouseLeave,
  forceRedraw,
  showTimelineYears,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [isTouchInteraction, setIsTouchInteraction] = useState(false);
  const [pendingTouchDate, setPendingTouchDate] = useState<string | null>(null);

  // Constants for mega overlay layout - make squares square
  const cellGap = 1;
  const maxDaysInMonth = 31;
  const months = 12;
  const cellWidth = (position.width - (months - 1) * cellGap) / months;
  const cellSize = cellWidth;
  const totalHeight = maxDaysInMonth * (cellSize + cellGap);

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

          // Determine cell color
          const highlightColor = highlights.get(dateStr);
          const color = highlightColor || COLOR.tile;

          ctx.fillStyle = color;
          ctx.fillRect(x, y, cellWidth, cellSize);

          // If this is the hovered date, draw red border
          if (dateStr === hoveredDate) {
            ctx.strokeStyle = "red";
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, cellWidth, cellSize);
          }
        }
      }
    }
  }, [year, position, highlights, cellWidth, cellSize, totalHeight, hoveredDate]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onHover) return;

    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dateStr = getMegaDateFromCoordinates(x, y, year, position.width);
    onHover(dateStr);
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
    if (!onHover || event.touches.length === 0) return;

    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const touch = event.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const dateStr = getMegaDateFromCoordinates(x, y, year, position.width);
    onHover(dateStr);
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
    if (!onClick) return;

    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dateStr = getMegaDateFromCoordinates(x, y, year, position.width);
    if (dateStr) onClick(dateStr);
  };

  const handleTouchGo = useCallback(() => {
    if (pendingTouchDate && onClick) {
      onClick(pendingTouchDate);
      setPendingTouchDate(null);
      setIsTouchInteraction(false);
    }
  }, [pendingTouchDate, onClick]);

  const handleTouchCancel = useCallback(() => {
    setPendingTouchDate(null);
    setIsTouchInteraction(false);
    setCursorPosition(null);
  }, []);

  const handleMouseLeave = () => {
    if (onHover) onHover(null);
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
  highlights: Map<string, string>;
  selectedDate: string | null;
}

// Main TimelineYears2 component
const TimelineYears2: React.FC<TimelineYears2Props> = ({ highlights, selectedDate }) => {
  // Global state hooks
  const { showTimelineYears } = useStateToggle();
  const { setSelectedDate } = useStateClock();

  // State to force redraw when timeline becomes visible
  const [forceRedrawCounter, setForceRedrawCounter] = useState(0);

  // Container ref for tooltip positioning
  const containerRef = useRef<HTMLDivElement>(null);

  // Force redraw when timeline becomes visible
  useEffect(() => {
    if (showTimelineYears) {
      setForceRedrawCounter((prev) => prev + 1);
    }
  }, [showTimelineYears]);

  // Handle date hover - no-op since MegaYearOverlay manages its own tooltip
  const handleDateHover = useCallback((_dateStr: string | null) => {
    // No-op - tooltip is managed within MegaYearOverlay
  }, []);

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
              onHover={handleDateHover}
              onClick={handleDateClick}
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
            onHover={handleDateHover}
            onClick={handleDateClick}
            onMouseEnter={handleMegaOverlayMouseEnter}
            onMouseLeave={handleMegaOverlayMouseLeave}
            forceRedraw={forceRedrawCounter}
            showTimelineYears={showTimelineYears}
          />
        )}
      </div>
    </>
  );
};

export default TimelineYears2;

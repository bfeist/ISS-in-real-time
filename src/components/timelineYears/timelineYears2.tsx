import React, { useEffect, useRef, useCallback, useState } from "react";
import styles from "./timelineYears2.module.css";

// Constants from the original HTML
const START_YEAR = 2000;
const END_YEAR = 2025;
const MONTH_GAP = 2;
const ROW_GAP = 2;

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
  onHover?: (dateStr: string | null, event?: MouseEvent) => void;
  onClick?: (dateStr: string) => void;
  onYearHover?: (yearIndex: number) => void;
  onYearLeave?: () => void;
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
        let color = COLOR.tile;
        if (highlights.has(dateStr)) {
          color = highlights.get(dateStr) || COLOR.tile;
        }

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
    onHover(dateStr, event.nativeEvent);
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
          style={{ width: "100%", height: "180px" }}
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
  onHover?: (dateStr: string | null, event?: MouseEvent) => void;
  onClick?: (dateStr: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}> = ({ year, position, highlights, onHover, onClick, onMouseEnter, onMouseLeave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Constants for mega overlay layout - make squares square
  const cellGap = 2;
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
          let color = COLOR.tile;
          if (highlights.has(dateStr)) {
            color = highlights.get(dateStr) || COLOR.tile;
          }

          ctx.fillStyle = color;
          ctx.fillRect(x, y, cellWidth, cellSize);
        }
      }
    }
  }, [year, position, highlights, cellWidth, cellSize, totalHeight]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onHover) return;

    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dateStr = getMegaDateFromCoordinates(x, y, year, position.width);
    onHover(dateStr, event.nativeEvent);
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

  const handleMouseLeave = () => {
    if (onHover) onHover(null);
    if (onMouseLeave) onMouseLeave();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div
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
  const cellGap = 2;
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
  selectedDate: Date | null;
  isCollapsed: boolean;
  onDateHover: (dateStr: string | null, event?: MouseEvent) => void;
  onDateClick: (dateStr: string) => void;
}

// Main TimelineYears2 component
const TimelineYears2: React.FC<TimelineYears2Props> = ({
  highlights,
  selectedDate,
  isCollapsed,
  onDateHover,
  onDateClick,
}) => {
  const [hoveredYearIndex, setHoveredYearIndex] = useState<number | null>(null);
  const [megaOverlayVisible, setMegaOverlayVisible] = useState(false);
  const [megaOverlayYear, setMegaOverlayYear] = useState<number | null>(null);
  const [megaOverlayPosition, setMegaOverlayPosition] = useState({ left: 0, top: 0, width: 0 });
  const [isOverMegaOverlay, setIsOverMegaOverlay] = useState(false);

  const yearsTimelineRef = useRef<HTMLDivElement>(null);

  const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);
  const selectedYearEl = selectedDate?.getFullYear() || null;

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

    if (!yearsTimelineRef.current) return;

    const yearElements = yearsTimelineRef.current.querySelectorAll(`.${styles.year}`);
    const yearEl = yearElements[yearIndex] as HTMLElement;
    if (!yearEl) return;

    const yearsTimelineRect = yearsTimelineRef.current.getBoundingClientRect();
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
    <div
      className={`${styles.yearsTimeline} ${isCollapsed ? styles.isCollapsed : ""}`}
      ref={yearsTimelineRef}
    >
      <div className={styles.years}>
        {years.map((year, index) => (
          <YearCanvas
            key={year}
            year={year}
            index={index}
            isActive={hoveredYearIndex === index}
            isSelected={selectedYearEl === year}
            highlights={highlights}
            onHover={onDateHover}
            onClick={onDateClick}
            onYearHover={handleYearHover}
            onYearLeave={handleYearLeave}
          />
        ))}
      </div>

      {/* Mega Overlay */}
      {megaOverlayVisible && megaOverlayYear && (
        <MegaYearOverlay
          year={megaOverlayYear}
          position={megaOverlayPosition}
          highlights={highlights}
          onHover={onDateHover}
          onClick={onDateClick}
          onMouseEnter={handleMegaOverlayMouseEnter}
          onMouseLeave={handleMegaOverlayMouseLeave}
        />
      )}
    </div>
  );
};

export default TimelineYears2;

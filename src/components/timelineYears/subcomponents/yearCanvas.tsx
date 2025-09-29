import React, { useEffect, useRef, useCallback } from "react";
import styles from "./yearCanvas.module.css";
import { useStateToggle } from "store/hooks/useStateToggle";

// Constants from the original HTML
const MONTH_GAP = 1;
const ROW_GAP = 1;

// Color constants
const COLORS = {
  hover: "#ffd600",
  selected: "#ffd600",
  noData: "#5b5d77ff",
  someData: "#6d7090",
  commData: "#7a7ea5ff",
  contentHighlightStroke: "#C500AB",
  contentHighlightFill: "#d4b5d0ff",
  transparent: "rgba(0, 0, 0, 0)",
  crewOnboard: "#ff9355",
  satisfiesHighlights: "#d9d9d9cc",
} as const;

interface YearCanvasProps {
  year: number;
  index: number;
  isActive?: boolean;
  isSelected?: boolean;
  highlights: Map<string, { fill: string; stroke?: string; expedition?: boolean }>;
  onYearHover?: (yearIndex: number) => void;
  onYearLeave?: () => void;
  forceRedraw?: number;
  startMonth?: number; // 0-based month index (0 = January)
  endMonth?: number; // 0-based month index (11 = December)
  selectedDate?: string | null;
}

// Individual year canvas component
const YearCanvas: React.FC<YearCanvasProps> = ({
  year,
  index,
  isActive,
  isSelected,
  highlights,
  onYearHover,
  onYearLeave,
  forceRedraw,
  startMonth = 0, // Default to January
  endMonth = 11, // Default to December
  selectedDate,
}) => {
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContainerMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    // Always show overlay when hovering over year header, regardless of timeline state
    if (target.closest(`.${styles.yearHeader}`)) {
      if (onYearHover) onYearHover(index);
      return;
    }
    // For other parts of the container, only show overlay if timeline is expanded
    if (showTimelineYears && onYearHover) {
      onYearHover(index);
    }
  };

  const handleContainerMouseLeave = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.relatedTarget as HTMLElement;
    // Don't trigger leave if moving to another year header
    if (target && target.closest("[data-year-index]")) {
      return;
    }
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
    drawYearCalendar(
      ctx,
      year,
      rect.width,
      rect.height,
      highlights,
      startMonth,
      endMonth,
      selectedDate
    );
  }, [year, highlights, startMonth, endMonth, selectedDate]);

  const drawYearCalendar = (
    ctx: CanvasRenderingContext2D,
    year: number,
    width: number,
    height: number,
    highlights: Map<string, { fill: string; stroke?: string; expedition?: boolean }>,
    startMonth: number = 0,
    endMonth: number = 11,
    selectedDate: string | null = null
  ) => {
    const maxDaysInMonth = 31;
    // Use full 12-month width calculation for consistent layout, but only draw visible months
    const cellWidth = (width - (12 - 1) * MONTH_GAP) / 12; // Always divide by 12 for consistent spacing
    const cellHeight = (height - (maxDaysInMonth - 1) * ROW_GAP) / maxDaysInMonth;

    for (let month = startMonth; month <= endMonth; month++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      // Calculate position as if all 12 months exist, but only draw visible ones
      const startX = month * (cellWidth + MONTH_GAP);

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const x = startX;
        const y = (day - 1) * (cellHeight + ROW_GAP); // Start from top of canvas

        // Get highlight info for this date
        const highlightInfo = highlights.get(dateStr);
        const fillColor = highlightInfo?.fill || COLORS.noData;
        const strokeColor = highlightInfo?.stroke;
        const hasExpedition = highlightInfo?.expedition;

        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, cellWidth, cellHeight);

        // Draw stroke if specified
        if (strokeColor) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cellWidth, cellHeight);
        }

        // Draw red outline if this is the selected date
        if (dateStr === selectedDate) {
          ctx.strokeStyle = COLORS.selected;
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, cellWidth, cellHeight);
        }

        // Draw dot in center if this date is part of a selected expedition
        if (hasExpedition) {
          const centerX = x + cellWidth / 2;
          const centerY = y + cellHeight / 2;
          const dotRadius = Math.min(cellWidth, cellHeight) * 0.25; // 25% of the smaller dimension

          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(centerX, centerY, dotRadius, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }
  };

  const handleMouseMove = () => {
    onYearHover(index);
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
      onMouseMove={handleMouseMove}
      data-year-index={index}
    >
      <div
        className={styles.yearHeader}
        role="button"
        tabIndex={0}
        onClick={() => setShowTimelineYears(!showTimelineYears)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setShowTimelineYears(!showTimelineYears);
            e.preventDefault();
          }
        }}
      >
        <div className={styles.yearTitle}>{year}</div>
      </div>
      <div
        className={styles.monthsCanvas}
        style={{ display: !showTimelineYears ? "none" : "block" }}
      >
        <canvas ref={canvasRef} style={{ width: "100%", height: "160px" }} />
      </div>
    </div>
  );
};

export default YearCanvas;
export { COLORS };

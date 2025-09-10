import React, { useEffect, useRef, useCallback } from "react";
import styles from "./YearCanvas.module.css";
import { useStateToggle } from "store/hooks/useStateToggle";

// Constants from the original HTML
const MONTH_GAP = 1;
const ROW_GAP = 1;

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
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();

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

export default YearCanvas;
export { COLORS };

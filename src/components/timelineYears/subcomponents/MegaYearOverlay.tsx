import React, { useEffect, useRef, useCallback, useState } from "react";
import styles from "./MegaYearOverlay.module.css";
import { useStateToggle } from "../../../store/hooks/useStateToggle";
import { useStateClock } from "../../../store/hooks/useStateClock";
import { useStateHover } from "../../../store/hooks/useStateHover";
import DateTooltip from "../dateTooltip/dateTooltip";

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

interface MegaYearOverlayProps {
  year: number;
  position: { left: number; top: number; width: number };
  highlights: Map<string, { fill: string; stroke?: string }>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  forceRedraw?: number;
}

// Mega Overlay Component for zoomed year view
const MegaYearOverlay: React.FC<MegaYearOverlayProps> = ({
  year,
  position,
  highlights,
  onMouseEnter,
  onMouseLeave,
  forceRedraw,
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

export default MegaYearOverlay;

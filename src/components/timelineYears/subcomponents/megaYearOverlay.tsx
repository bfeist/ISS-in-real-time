import React, { useEffect, useRef, useCallback, useState } from "react";
import styles from "./megaYearOverlay.module.css";
import { useStateToggle } from "../../../store/hooks/useStateToggle";
import { useStateClock } from "../../../store/hooks/useStateClock";
import { useStateHover } from "../../../store/hooks/useStateHover";
import DateTooltip from "../dateTooltip/dateTooltip";

import { COLORS } from "./yearCanvas";

interface MegaYearOverlayProps {
  year: number;
  position: { left: number; top: number; width: number };
  highlights: Map<string, { fill: string; stroke?: string; expedition?: boolean }>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  forceRedraw?: number;
  startMonth?: number; // 0-based month index (0 = January)
  endMonth?: number; // 0-based month index (11 = December)
  selectedDate?: string | null;
  externalCursorPosition?: { x: number; y: number } | null;
}

// Mega Overlay Component for zoomed year view
const MegaYearOverlay: React.FC<MegaYearOverlayProps> = ({
  year,
  position,
  highlights,
  onMouseEnter,
  onMouseLeave,
  forceRedraw,
  startMonth = 0, // Default to January
  endMonth = 11, // Default to December
  selectedDate,
  externalCursorPosition,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [isTouchInteraction, setIsTouchInteraction] = useState(false);
  const [pendingTouchDate, setPendingTouchDate] = useState<string | null>(null);
  const [hideTimeout, setHideTimeout] = useState<NodeJS.Timeout | null>(null);

  // Global state hooks
  const { hoveredDate, setHoveredDate } = useStateHover();
  const { setSelectedDate } = useStateClock();
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();

  // Handle date click using global state with touch device logic
  const handleDateClick = useCallback(
    (dateStr: string) => {
      setSelectedDate(dateStr);
    },
    [setSelectedDate]
  );

  // Constants for mega overlay layout - make squares square
  const cellGap = 1;
  const maxDaysInMonth = 31;
  // Use full 12-month layout for consistent positioning with main canvas
  const cellWidth = (position.width - (12 - 1) * cellGap) / 12; // Always divide by 12
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

      for (let month = startMonth; month <= endMonth; month++) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        if (day <= daysInMonth) {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          // Position as if all 12 months exist, but only draw visible ones
          const x = month * (cellWidth + cellGap);

          // Get highlight info for this date
          const highlightInfo = highlights.get(dateStr);
          const fillColor = highlightInfo?.fill || COLORS.noData;
          const strokeColor = highlightInfo?.stroke;
          const hasExpedition = highlightInfo?.expedition;

          ctx.fillStyle = fillColor;
          ctx.fillRect(x, y, cellWidth, cellSize);

          // Draw stroke if specified
          if (strokeColor) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, cellWidth, cellSize);
          }

          // If this is the selected date, draw red outline
          if (dateStr === selectedDate) {
            ctx.strokeStyle = COLORS.selected;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, cellWidth, cellSize);
          }

          // If this is the hovered date, draw red border
          if (dateStr === hoveredDate) {
            ctx.strokeStyle = COLORS.hover;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, cellWidth, cellSize);
          }

          // Draw dot in center if this date is part of a selected expedition
          if (hasExpedition) {
            const centerX = x + cellWidth / 2;
            const centerY = y + cellSize / 2;
            const dotRadius = Math.min(cellWidth, cellSize) * 0.25; // 25% of the smaller dimension

            ctx.fillStyle = "white";
            ctx.beginPath();
            ctx.arc(centerX, centerY, dotRadius, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }
    }
  }, [
    year,
    position,
    highlights,
    cellWidth,
    cellSize,
    totalHeight,
    hoveredDate,
    selectedDate,
    startMonth,
    endMonth,
  ]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dateStr = getMegaDateFromCoordinates(x, y, year, position.width, startMonth, endMonth);
    if (hoveredDate !== dateStr) {
      setHoveredDate(dateStr);
    }

    // Update cursor position for tooltip
    setCursorPosition({ x: event.clientX, y: event.clientY });

    // Reset touch interaction flag when mouse is used
    setIsTouchInteraction(false);
  };

  const handleTouchStart = (_event: React.TouchEvent<HTMLDivElement>) => {
    isDragging.current = false;
    setIsTouchInteraction(true);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    isDragging.current = true;
    if (event.touches.length === 0) return;

    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const touch = event.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const dateStr = getMegaDateFromCoordinates(x, y, year, position.width, startMonth, endMonth);
    setHoveredDate(dateStr);

    // Update cursor position for tooltip
    setCursorPosition({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (_event: React.TouchEvent<HTMLDivElement>) => {
    // Keep tooltip visible for touch interactions until explicitly cancelled
    if (!pendingTouchDate && hoveredDate) {
      setPendingTouchDate(hoveredDate);
    }
    // Maintain touch interaction state when we have a pending touch
    if (hoveredDate) {
      setIsTouchInteraction(true);
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging.current) {
      isDragging.current = false; // Reset for the next touch
      return;
    }
    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dateStr = getMegaDateFromCoordinates(x, y, year, position.width, startMonth, endMonth);
    if (dateStr) handleDateClick(dateStr);

    // close the years dropdown
    setShowTimelineYears(false);
  };

  const handleTouchGo = useCallback(
    (date?: string | null) => {
      const dateToSelect = date ?? pendingTouchDate ?? hoveredDate;

      if (!dateToSelect) {
        return;
      }

      handleDateClick(dateToSelect);
      setPendingTouchDate(null);
      setIsTouchInteraction(false);
      setHoveredDate(null);
      setCursorPosition(null);
      setShowTimelineYears(false);
    },
    [pendingTouchDate, hoveredDate, handleDateClick, setShowTimelineYears, setHoveredDate]
  );

  const handleTouchCancel = useCallback(() => {
    setPendingTouchDate(null);
    setIsTouchInteraction(false);
    setCursorPosition(null);
  }, []);

  const handleMouseLeave = () => {
    if (hideTimeout) clearTimeout(hideTimeout);
    const timeout = setTimeout(() => {
      setHoveredDate(null);
      setCursorPosition(null);
      onMouseLeave();
    }, 50); // Reduced delay to 50ms to match year header timing
    setHideTimeout(timeout);
  };

  const handleMouseEnter = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      setHideTimeout(null);
    }
    if (onMouseEnter) onMouseEnter();
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [hideTimeout]);

  useEffect(() => {
    if (externalCursorPosition) {
      setCursorPosition(externalCursorPosition);
      setIsTouchInteraction(true);
    } else {
      // When external cursor position is cleared, maintain touch interaction if we have a pending touch
      if (!pendingTouchDate) {
        setIsTouchInteraction(false);
      }
      // Don't clear cursor position if we have pending touch - keep tooltip visible
      if (!pendingTouchDate) {
        setCursorPosition(null);
      }
    }
  }, [externalCursorPosition, pendingTouchDate]);

  if (!showTimelineYears) return null;

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
      onMouseEnter={handleMouseEnter}
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
export const getMegaDateFromCoordinates = (
  x: number,
  y: number,
  year: number,
  width: number,
  startMonth: number = 0,
  endMonth: number = 11
): string | null => {
  const cellGap = 1;
  // Use 12-month layout for coordinate calculation
  const cellWidth = (width - (12 - 1) * cellGap) / 12;
  const cellSize = cellWidth;

  // Determine month based on 12-month grid
  const month = Math.floor(x / (cellWidth + cellGap));
  if (month < startMonth || month > endMonth) return null;

  // Determine day
  const day = Math.floor(y / (cellSize + cellGap)) + 1;

  // Validate day exists in this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;

  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export default MegaYearOverlay;

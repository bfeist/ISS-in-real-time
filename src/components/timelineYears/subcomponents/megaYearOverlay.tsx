import React, { useEffect, useRef, useCallback, useState } from "react";
import styles from "./megaYearOverlay.module.css";
import { useStateToggle } from "../../../store/hooks/useStateToggle";
import { useStateClock } from "../../../store/hooks/useStateClock";
import { useStateHover } from "../../../store/hooks/useStateHover";
import DateTooltip from "../dateTooltip/dateTooltip";
import { appSecondsFromDateTime } from "../../../utils/time";

import { COLORS } from "./yearCanvas";

interface MegaYearOverlayProps {
  year: number;
  yearIndex: number;
  position: { left: number; top: number; width: number };
  highlights: Map<
    string,
    { fill: string; stroke?: string; expedition?: boolean; notableDatetime?: string }
  >;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onSwitchToAdjacentYear?: (yearIndex: number) => void;
  forceRedraw?: number;
  startMonth?: number; // 0-based month index (0 = January)
  endMonth?: number; // 0-based month index (11 = December)
  selectedDate?: string | null;
  externalCursorPosition?: { x: number; y: number } | null;
  initialTouch?: { clientX: number; clientY: number; identifier?: number; sequence: number } | null;
  isTouchDevice?: boolean;
}

// Mega Overlay Component for zoomed year view
const MegaYearOverlay: React.FC<MegaYearOverlayProps> = ({
  year,
  yearIndex,
  position,
  highlights,
  onMouseEnter,
  onMouseLeave,
  onSwitchToAdjacentYear,
  forceRedraw,
  startMonth = 0, // Default to January
  endMonth = 11, // Default to December
  selectedDate,
  externalCursorPosition,
  initialTouch,
  isTouchDevice = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const calendarContentRef = useRef<HTMLDivElement>(null); // Ref for just the calendar content (for tooltip positioning)
  const touchYOffsetRef = useRef(0);
  const isDragging = useRef(false);
  const ignoreMouseEventsRef = useRef(false);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingTouchDate, setPendingTouchDate] = useState<string | null>(null);
  const [hideTimeout, setHideTimeout] = useState<NodeJS.Timeout | null>(null);
  const lastInitialTouchSequenceRef = useRef<number | null>(null);

  // Global state hooks
  const { hoveredDate, setHoveredDate } = useStateHover();
  const { setSelectedDate, setClock } = useStateClock();
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();

  // Handle date click using global state with touch device logic
  const handleDateClick = useCallback(
    (dateStr: string) => {
      setSelectedDate(dateStr);

      // Check if this date has a Notable Moment item with a specific time
      const highlightInfo = highlights.get(dateStr);
      if (highlightInfo?.notableDatetime) {
        // Extract the time from the Notable Moment datetime and set the clock
        const appSeconds = appSecondsFromDateTime(highlightInfo.notableDatetime);
        if (appSeconds !== null) {
          setClock(appSeconds);
        }
      }
    },
    [setSelectedDate, setClock, highlights]
  );

  // Constants for mega overlay layout - make squares square
  const cellGap = 1;
  const maxDaysInMonth = 31;
  // Use full 12-month layout for consistent positioning with main canvas
  const cellWidth = (position.width - (12 - 1) * cellGap) / 12; // Always divide by 12
  const cellSize = cellWidth;
  const totalHeight = maxDaysInMonth * (cellSize + cellGap);
  const touchVerticalOffset = Math.min(Math.max(cellSize * 2, 72), 140);
  const touchExtensionHeight = touchVerticalOffset + cellSize * 1.5;
  const interactiveHeight = totalHeight + touchExtensionHeight;

  // Horizontal extension zones for year switching (25% of width on each side)
  const horizontalExtensionWidth = position.width * 0.25;

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

  // Check if position is in horizontal extension zones and handle year switching
  const checkHorizontalExtension = useCallback(
    (x: number) => {
      if (!onSwitchToAdjacentYear) return false;

      // Left extension zone (negative x values from 0 to -horizontalExtensionWidth)
      if (x < 0 && x >= -horizontalExtensionWidth) {
        onSwitchToAdjacentYear(yearIndex - 1);
        return true;
      }

      // Right extension zone (x values beyond width up to width + horizontalExtensionWidth)
      if (x >= position.width && x < position.width + horizontalExtensionWidth) {
        onSwitchToAdjacentYear(yearIndex + 1);
        return true;
      }

      return false;
    },
    [onSwitchToAdjacentYear, horizontalExtensionWidth, position.width, yearIndex]
  );

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (ignoreMouseEventsRef.current || isTouchDevice) {
      ignoreMouseEventsRef.current = false;
      return;
    }

    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Only adjust x coordinate for touch devices that have horizontal extensions
    const adjustedX = isTouchDevice ? x - horizontalExtensionWidth : x;

    // Check if we're in a horizontal extension zone (only for touch devices)
    if (isTouchDevice && checkHorizontalExtension(adjustedX)) {
      return;
    }

    const dateStr = getMegaDateFromCoordinates(
      adjustedX,
      y,
      year,
      position.width,
      startMonth,
      endMonth
    );
    // Only update hoveredDate if we get a valid date (not null from gaps)
    if (dateStr && hoveredDate !== dateStr) {
      setHoveredDate(dateStr);
    }

    // Update cursor position for tooltip
    setCursorPosition({ x: event.clientX, y: event.clientY });

    const nativeEvent = event.nativeEvent as MouseEvent & {
      sourceCapabilities?: { firesTouchEvents?: boolean };
    };

    if (nativeEvent.sourceCapabilities?.firesTouchEvents) {
      return;
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault(); // Prevent text selection and context menu on long press
    isDragging.current = false;
    ignoreMouseEventsRef.current = true;

    const container = containerRef.current;
    if (!container || event.touches.length === 0) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const touch = event.touches[0];
    const rawX = touch.clientX - rect.left;
    const rawY = touch.clientY - rect.top;

    // Adjust x coordinate to account for left horizontal extension
    const adjustedX = rawX - horizontalExtensionWidth;

    // Check if we're in a horizontal extension zone
    if (checkHorizontalExtension(adjustedX)) {
      return;
    }

    touchYOffsetRef.current = Math.min(rawY, touchVerticalOffset);

    const adjustedY = Math.min(Math.max(rawY - touchYOffsetRef.current, 0), totalHeight - 1);
    const dateStr = getMegaDateFromCoordinates(
      adjustedX,
      adjustedY,
      year,
      position.width,
      startMonth,
      endMonth
    );
    // Only update hoveredDate if we get a valid date
    if (dateStr) {
      setHoveredDate(dateStr);
    }

    // Position tooltip and highlight above the user's finger
    setCursorPosition({ x: touch.clientX, y: touch.clientY - touchYOffsetRef.current });
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault(); // Prevent text selection during drag
    isDragging.current = true;
    if (event.touches.length === 0) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const touch = event.touches[0];
    const x = touch.clientX - rect.left;
    const rawY = touch.clientY - rect.top;

    // Adjust x coordinate to account for left horizontal extension
    const adjustedX = x - horizontalExtensionWidth;

    // Check if we're in a horizontal extension zone
    if (checkHorizontalExtension(adjustedX)) {
      return;
    }

    const adjustedY = Math.min(Math.max(rawY - touchYOffsetRef.current, 0), totalHeight - 1);

    const dateStr = getMegaDateFromCoordinates(
      adjustedX,
      adjustedY,
      year,
      position.width,
      startMonth,
      endMonth
    );
    // Only update hoveredDate if we get a valid date
    if (dateStr) {
      setHoveredDate(dateStr);
    }

    // Update cursor position for tooltip to stay above the finger
    setCursorPosition({ x: touch.clientX, y: touch.clientY - touchYOffsetRef.current });

    ignoreMouseEventsRef.current = true;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.changedTouches.length > 0) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const touch = event.changedTouches[0];
        const rawY = touch.clientY - rect.top;
        const x = touch.clientX - rect.left;
        // Adjust x coordinate to account for left horizontal extension
        const adjustedX = x - horizontalExtensionWidth;
        const adjustedY = Math.min(Math.max(rawY - touchYOffsetRef.current, 0), totalHeight - 1);
        const dateStr = getMegaDateFromCoordinates(
          adjustedX,
          adjustedY,
          year,
          position.width,
          startMonth,
          endMonth
        );
        // Only update hoveredDate if we get a valid date
        if (dateStr) {
          setHoveredDate(dateStr);
        }
        setCursorPosition({ x: touch.clientX, y: touch.clientY - touchYOffsetRef.current });
      }
    }

    // Keep tooltip visible for touch interactions until explicitly cancelled
    if (!pendingTouchDate && hoveredDate) {
      setPendingTouchDate(hoveredDate);
    }

    ignoreMouseEventsRef.current = true;
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // Ignore mouse events on touch devices to prevent interference with touch interactions
    if (isTouchDevice) return;

    if (isDragging.current) {
      isDragging.current = false; // Reset for the next touch
      return;
    }
    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Only adjust x coordinate for touch devices that have horizontal extensions
    const adjustedX = isTouchDevice ? x - horizontalExtensionWidth : x;

    const dateStr = getMegaDateFromCoordinates(
      adjustedX,
      y,
      year,
      position.width,
      startMonth,
      endMonth
    );
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
      setHoveredDate(null);
      setCursorPosition(null);
      setShowTimelineYears(false);
      touchYOffsetRef.current = 0;
      ignoreMouseEventsRef.current = false;
    },
    [pendingTouchDate, hoveredDate, handleDateClick, setShowTimelineYears, setHoveredDate]
  );

  const handleTouchCancel = useCallback(() => {
    setPendingTouchDate(null);
    setCursorPosition(null);
    touchYOffsetRef.current = 0;
    ignoreMouseEventsRef.current = false;
  }, []);

  const handleMouseLeave = () => {
    // Ignore mouse events on touch devices to prevent interference with touch interactions
    if (isTouchDevice) return;

    if (hideTimeout) clearTimeout(hideTimeout);
    const timeout = setTimeout(() => {
      setHoveredDate(null);
      setCursorPosition(null);
      onMouseLeave?.();
    }, 50); // Reduced delay to 50ms to match year header timing
    setHideTimeout(timeout);
  };

  const handleMouseEnter = () => {
    // Ignore mouse events on touch devices to prevent interference with touch interactions
    if (isTouchDevice) return;

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

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [hideTimeout]);

  useEffect(() => {
    if (externalCursorPosition) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const rawX = externalCursorPosition.x - rect.left;
        const rawY = externalCursorPosition.y - rect.top;
        // Adjust x coordinate to account for left horizontal extension
        const adjustedX = rawX - horizontalExtensionWidth;
        const adjustedY = Math.min(Math.max(rawY - touchYOffsetRef.current, 0), totalHeight - 1);

        const dateStr = getMegaDateFromCoordinates(
          adjustedX,
          adjustedY,
          year,
          position.width,
          startMonth,
          endMonth
        );

        if (dateStr && hoveredDate !== dateStr) {
          setHoveredDate(dateStr);
        }

        setCursorPosition({
          x: externalCursorPosition.x,
          y: externalCursorPosition.y - touchYOffsetRef.current,
        });
      }
      return;
    }

    if (!pendingTouchDate && isTouchDevice) {
      setCursorPosition(null);
    }
  }, [
    externalCursorPosition,
    pendingTouchDate,
    totalHeight,
    year,
    position.width,
    startMonth,
    endMonth,
    hoveredDate,
    setHoveredDate,
    horizontalExtensionWidth,
    isTouchDevice,
  ]);

  useEffect(() => {
    if (!initialTouch || !showTimelineYears) {
      return;
    }

    if (lastInitialTouchSequenceRef.current === initialTouch.sequence) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    lastInitialTouchSequenceRef.current = initialTouch.sequence;

    const rect = container.getBoundingClientRect();
    const rawX = initialTouch.clientX - rect.left;
    const rawY = initialTouch.clientY - rect.top;

    // Adjust x coordinate to account for left horizontal extension
    const adjustedX = rawX - horizontalExtensionWidth;

    touchYOffsetRef.current = Math.min(rawY, touchVerticalOffset);

    const adjustedY = Math.min(Math.max(rawY - touchYOffsetRef.current, 0), totalHeight - 1);
    const dateStr = getMegaDateFromCoordinates(
      adjustedX,
      adjustedY,
      year,
      position.width,
      startMonth,
      endMonth
    );

    if (dateStr) {
      setHoveredDate(dateStr);
    }

    setCursorPosition({
      x: initialTouch.clientX,
      y: initialTouch.clientY - touchYOffsetRef.current,
    });
    ignoreMouseEventsRef.current = true;
  }, [
    initialTouch,
    showTimelineYears,
    touchVerticalOffset,
    totalHeight,
    year,
    position.width,
    startMonth,
    endMonth,
    setHoveredDate,
    horizontalExtensionWidth,
  ]);

  if (!showTimelineYears) return null;

  // For touch devices, render with full touchZone including extensions
  if (isTouchDevice) {
    return (
      <div
        ref={containerRef}
        className={styles.touchZone}
        style={{
          left: position.left - horizontalExtensionWidth,
          top: position.top,
          width: position.width + horizontalExtensionWidth * 2,
          height: interactiveHeight,
          zIndex: 10,
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={handleMouseEnter}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={(event) => {
          event.stopPropagation();
          handleTouchCancel();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="grid"
        tabIndex={0}
        aria-label={`Calendar for ${year}`}
      >
        {/* Backdrop to block mouse events from passing through */}
        <div
          className={styles.backdrop}
          style={{
            width: position.width + horizontalExtensionWidth * 2,
            height: totalHeight,
          }}
          aria-hidden="true"
        />

        {/* Left horizontal extension zone - transparent */}
        <div
          className={styles.horizontalExtension}
          style={{ width: horizontalExtensionWidth, height: totalHeight }}
          aria-hidden="true"
        />

        {/* Calendar content wrapper - used for tooltip positioning */}
        <div
          ref={calendarContentRef}
          className={styles.yearOverlay}
          style={{ height: totalHeight }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: `${position.width}px`,
              height: `${totalHeight}px`,
              pointerEvents: "none",
            }}
          />
        </div>

        {/* Right horizontal extension zone - transparent */}
        <div
          className={styles.horizontalExtension}
          style={{ width: horizontalExtensionWidth, height: totalHeight }}
          aria-hidden="true"
        />

        <div
          className={styles.touchExtension}
          style={{ height: touchExtensionHeight }}
          aria-hidden="true"
        />
        {/* Date Tooltip for this overlay - uses calendarContentRef for positioning */}
        <DateTooltip
          hoveredDate={hoveredDate}
          cursorPosition={cursorPosition}
          isTouchDevice={isTouchDevice}
          onTouchGo={handleTouchGo}
          onTouchCancel={handleTouchCancel}
          containerRef={calendarContentRef}
        />
      </div>
    );
  }

  // For mouse devices, render simplified version without touch extensions
  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: position.left,
        top: position.top,
        width: position.width,
        height: totalHeight,
        zIndex: 10,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="grid"
      tabIndex={0}
      aria-label={`Calendar for ${year}`}
    >
      <div ref={calendarContentRef} className={styles.yearOverlay} style={{ height: totalHeight }}>
        <canvas
          ref={canvasRef}
          style={{
            width: `${position.width}px`,
            height: `${totalHeight}px`,
            pointerEvents: "none",
          }}
        />
      </div>
      {/* Date Tooltip for this overlay - uses calendarContentRef for positioning */}
      <DateTooltip
        hoveredDate={hoveredDate}
        cursorPosition={cursorPosition}
        isTouchDevice={isTouchDevice}
        onTouchGo={handleTouchGo}
        onTouchCancel={handleTouchCancel}
        containerRef={calendarContentRef}
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
  const cellSpanX = cellWidth + cellGap;
  const cellSpanY = cellSize + cellGap;
  const maxDaysInMonth = 31;
  const totalHeight = maxDaysInMonth * cellSpanY;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  if (y < 0 || y >= totalHeight) {
    return null;
  }

  const normalizedX = Math.min(Math.max(x, 0), width - Number.EPSILON);
  const normalizedY = Math.min(Math.max(y, 0), totalHeight - Number.EPSILON);

  let month = Math.floor(normalizedX / cellSpanX);
  const monthOffsetWithinCell = normalizedX - month * cellSpanX;

  if (monthOffsetWithinCell > cellWidth) {
    const distanceIntoGap = monthOffsetWithinCell - cellWidth;
    if (distanceIntoGap > cellGap / 2) {
      month += 1;
    }
  }

  if (month < startMonth) {
    month = startMonth;
  } else if (month > endMonth) {
    month = endMonth;
  }

  let dayIndex = Math.floor(normalizedY / cellSpanY);
  const dayOffsetWithinCell = normalizedY - dayIndex * cellSpanY;

  if (dayOffsetWithinCell > cellSize) {
    const distanceIntoGap = dayOffsetWithinCell - cellSize;
    if (distanceIntoGap > cellGap / 2) {
      dayIndex += 1;
    }
  }

  if (dayIndex < 0) {
    dayIndex = 0;
  }
  if (dayIndex >= maxDaysInMonth) {
    dayIndex = maxDaysInMonth - 1;
  }

  let day = dayIndex + 1;

  // Determine month based on 12-month grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (day > daysInMonth) {
    day = daysInMonth;
  }

  // Validate day exists in this month
  if (day < 1 || day > daysInMonth) return null;

  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export default MegaYearOverlay;

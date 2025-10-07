import React, { useCallback, useRef } from "react";
import styles from "./megaYearOverlay.module.css";
import { useStateToggle } from "../../../store/hooks/useStateToggle";
import { useStateClock } from "../../../store/hooks/useStateClock";
import { useStateHover } from "../../../store/hooks/useStateHover";
import DateTooltip from "../dateTooltip/dateTooltip";
import { appSecondsFromDateTime } from "../../../utils/time";

import { useMegaOverlayLayout } from "../hooks/useMegaOverlayLayout";
import { useMegaOverlayCanvas, type HighlightInfo } from "../hooks/useMegaOverlayCanvas";
import { useMegaOverlayInteraction } from "../hooks/useMegaOverlayInteraction";

interface MegaYearOverlayProps {
  year: number;
  yearIndex: number;
  position: { left: number; top: number; width: number };
  highlights: Map<string, HighlightInfo>;
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
  const calendarContentRef = useRef<HTMLDivElement>(null);

  const { hoveredDate, setHoveredDate } = useStateHover();
  const { setSelectedDate, setClock } = useStateClock();
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();

  const layout = useMegaOverlayLayout(position.width);

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

  useMegaOverlayCanvas({
    canvasRef,
    layout,
    year,
    width: position.width,
    startMonth,
    endMonth,
    highlights,
    selectedDate,
    hoveredDate,
    forceRedraw,
  });

  const {
    cursorPosition,
    handleMouseMove,
    handleMouseLeave,
    handleMouseEnter,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchGo,
    handleTouchCancel,
    handleClick,
    handleKeyDown,
  } = useMegaOverlayInteraction({
    year,
    yearIndex,
    position,
    startMonth,
    endMonth,
    isTouchDevice,
    layout,
    onMouseEnter,
    onMouseLeave,
    onSwitchToAdjacentYear,
    handleDateClick,
    containerRef,
    setHoveredDate,
    hoveredDate,
    setShowTimelineYears,
    showTimelineYears,
    externalCursorPosition,
    initialTouch,
  });

  if (!showTimelineYears) {
    return null;
  }

  if (isTouchDevice) {
    return (
      <div
        ref={containerRef}
        className={styles.touchZone}
        style={{
          left: position.left - layout.horizontalExtensionWidth,
          top: position.top,
          width: position.width + layout.horizontalExtensionWidth * 2,
          height: layout.interactiveHeight,
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
        <div
          className={styles.backdrop}
          style={{
            width: position.width + layout.horizontalExtensionWidth * 2,
            height: layout.totalHeight,
          }}
          aria-hidden="true"
        />
        <div
          className={styles.horizontalExtension}
          style={{ width: layout.horizontalExtensionWidth, height: layout.totalHeight }}
          aria-hidden="true"
        />
        <div
          ref={calendarContentRef}
          className={styles.yearOverlay}
          style={{ height: layout.totalHeight }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: `${position.width}px`,
              height: `${layout.totalHeight}px`,
              pointerEvents: "none",
            }}
          />
        </div>
        <div
          className={styles.horizontalExtension}
          style={{ width: layout.horizontalExtensionWidth, height: layout.totalHeight }}
          aria-hidden="true"
        />
        <div
          className={styles.touchExtension}
          style={{ height: layout.touchExtensionHeight }}
          aria-hidden="true"
        />
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

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: position.left,
        top: position.top,
        width: position.width,
        height: layout.totalHeight,
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
      <div
        ref={calendarContentRef}
        className={styles.yearOverlay}
        style={{ height: layout.totalHeight }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: `${position.width}px`,
            height: `${layout.totalHeight}px`,
            pointerEvents: "none",
          }}
        />
      </div>
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

export { getMegaDateFromCoordinates } from "./megaYearOverlay.utils";

export default MegaYearOverlay;

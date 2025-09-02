import React, { FunctionComponent, useRef, useCallback, useMemo } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import styles from "./dateTooltip.module.css";
import { useGeneralDataAvailabilities } from "api/useGeneralData";
import ExpeditionsSection from "./subcomponents/expeditionsSection";
import CrewOnboardSection from "./subcomponents/crewOnboardSection";
import VehiclesDockedSection from "./subcomponents/vehiclesDockedSection";
import ContentIndicatorsSection from "./subcomponents/contentIndicatorsSection";
import FirstCommSection from "./subcomponents/firstCommSection";

// Configure dayjs to use UTC plugin
dayjs.extend(utc);

interface DateTooltipProps {
  hoveredDate: string | null;
  cursorPosition: { x: number; y: number } | null;
  isTouchInteraction: boolean;
  showTimelineYears: boolean;
  onTouchGo: () => void;
  onTouchCancel: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

const DateTooltip: FunctionComponent<DateTooltipProps> = ({
  hoveredDate,
  cursorPosition,
  isTouchInteraction,
  showTimelineYears,
  onTouchGo,
  onTouchCancel,
  containerRef,
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Extract data from React Query hooks
  const { data: dataAvailabilityItems } = useGeneralDataAvailabilities();

  // Get content availability for the hovered date
  const contentAvailability = useMemo(() => {
    if (!hoveredDate || !dataAvailabilityItems) return null;
    return dataAvailabilityItems.find((item) => item.date === hoveredDate);
  }, [hoveredDate, dataAvailabilityItems]);

  // Fetch communication data if available
  const hasCommData = contentAvailability?.comm || contentAvailability?.vvComm;

  // Format date for tooltip display
  const formatTooltipDate = useCallback((dateString: string): string => {
    try {
      // Parse the date string as UTC and format it
      const date = dayjs.utc(dateString);
      return date.format("ddd, MMM DD, YYYY");
    } catch {
      return dateString;
    }
  }, []);

  // Calculate tooltip position
  const getTooltipStyle = useCallback((): React.CSSProperties => {
    if (!cursorPosition || !hoveredDate || !showTimelineYears) {
      return { pointerEvents: "none", visibility: "hidden" };
    }

    const offset = 10;
    const tooltipElement = tooltipRef.current;

    // Use dynamic height calculation or fallback to estimated height
    const estimatedBaseHeight = isTouchInteraction ? 320 : 300;
    const estimatedExtraHeightForComm = hasCommData ? 200 : 0;
    const tooltipHeight = tooltipElement
      ? tooltipElement.offsetHeight || estimatedBaseHeight + estimatedExtraHeightForComm
      : estimatedBaseHeight + estimatedExtraHeightForComm;
    const tooltipWidth = tooltipElement ? tooltipElement.offsetWidth || 600 : 600;

    // Get container position for relative boundary calculation
    const container = containerRef.current;
    const containerRect = container ? container.getBoundingClientRect() : null;
    const containerTop = containerRect ? containerRect.top : 0;

    let x = cursorPosition.x + offset;
    let y = cursorPosition.y - tooltipHeight - offset; // Default to above cursor

    // Check if tooltip would be too close to top of viewport OR container
    const topBoundary = Math.max(
      window.scrollY + 20, // Viewport boundary
      containerTop + 10 // Container boundary
    );

    if (y < topBoundary) {
      y = cursorPosition.y + offset; // Switch to below cursor
    }

    // Check if tooltip would go off bottom of viewport (use 80vh as max)
    const maxTooltipHeight = window.innerHeight * 0.8;
    const bottomBoundary =
      window.scrollY + window.innerHeight - Math.min(tooltipHeight, maxTooltipHeight) - 20;
    if (y > bottomBoundary) {
      y = cursorPosition.y - Math.min(tooltipHeight, maxTooltipHeight) - offset; // Force above cursor
    }

    // Check if tooltip would go off right edge of screen
    if (x + tooltipWidth > window.innerWidth) {
      x = cursorPosition.x - tooltipWidth - offset; // Switch to left side
    }

    // Check if tooltip would go off left edge of screen
    if (x < 10) {
      x = 10; // Keep it on screen
    }

    return {
      left: `${x}px`,
      top: `${y}px`,
      visibility: "visible",
      pointerEvents: isTouchInteraction ? "auto" : "none", // Enable pointer events for touch interactions
    };
  }, [
    cursorPosition,
    hoveredDate,
    isTouchInteraction,
    showTimelineYears,
    containerRef,
    hasCommData,
  ]);

  return (
    <div ref={tooltipRef} className={styles.dateTooltip} style={getTooltipStyle()}>
      {hoveredDate && (
        <>
          <div className={styles.tooltipHeader}>
            <div className={styles.tooltipDate}>{formatTooltipDate(hoveredDate)}</div>
            {isTouchInteraction && (
              <div className={styles.tooltipButtons}>
                <button className={styles.tooltipGoButton} onClick={onTouchGo} type="button">
                  Go
                </button>
                <button
                  className={styles.tooltipCancelButton}
                  onClick={onTouchCancel}
                  type="button"
                  title="Close"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          <div className={styles.tooltipContent}>
            <div className={styles.tooltipGrid}>
              <div className={styles.columnHeader}>Expeditions</div>
              <div className={styles.columnHeader}>Crew Onboard</div>
              <div className={styles.columnHeader}>Vehicles Docked</div>

              <ExpeditionsSection hoveredDate={hoveredDate} />
              <CrewOnboardSection hoveredDate={hoveredDate} />
              <VehiclesDockedSection hoveredDate={hoveredDate} />
            </div>
          </div>

          <ContentIndicatorsSection hoveredDate={hoveredDate} />

          <FirstCommSection hoveredDate={hoveredDate} hasCommData={hasCommData} />
        </>
      )}
    </div>
  );
};

export default DateTooltip;

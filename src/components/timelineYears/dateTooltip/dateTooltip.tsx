import React, { FunctionComponent, useRef, useCallback, useMemo } from "react";
import styles from "./dateTooltip.module.css";
import { useGeneralDataAvailabilities, useGeneralOrbitsDaily } from "api/useGeneralData";
import ExpeditionsSection from "./subcomponents/expeditionsSection";
import CrewOnboardSection from "./subcomponents/crewOnboardSection";
import VehiclesDockedSection from "./subcomponents/vehiclesDockedSection";
import ContentIndicatorsSection from "../subcomponents/contentIndicatorsSection";
import FirstCommSection from "./subcomponents/firstCommSection";

const DateTooltip: FunctionComponent<{
  hoveredDate: string | null;
  cursorPosition: { x: number; y: number } | null;
  isTouchInteraction: boolean;
  onTouchGo: (date: string | null) => void;
  onTouchCancel: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
}> = ({
  hoveredDate,
  cursorPosition,
  isTouchInteraction,
  onTouchGo,
  onTouchCancel,
  containerRef,
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const goButtonTouchActiveRef = useRef(false);
  const cancelButtonTouchActiveRef = useRef(false);

  // Extract data from React Query hooks
  const { data: dataAvailabilityItems } = useGeneralDataAvailabilities();
  const { data: orbitsDaily } = useGeneralOrbitsDaily();

  // Get content availability for the hovered date
  const contentAvailability = useMemo(() => {
    if (!hoveredDate || !dataAvailabilityItems) return null;
    return dataAvailabilityItems.find((item) => item.date === hoveredDate);
  }, [hoveredDate, dataAvailabilityItems]);

  // Fetch communication data if available
  const hasCommData = contentAvailability?.comm || contentAvailability?.vvComm;

  // Format date for tooltip display
  const formatTooltipDate = (dateString: string): string => {
    try {
      // Parse the date string and format it
      const date = new Date(dateString + "T00:00:00Z"); // Treat as UTC
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "2-digit",
        timeZone: "UTC",
      });
    } catch {
      return dateString;
    }
  };

  // Calculate tooltip position
  const getTooltipStyle = useCallback((): React.CSSProperties => {
    if (!cursorPosition || !hoveredDate) {
      return { pointerEvents: "none", visibility: "hidden" };
    }

    const offset = 30;
    const tooltipElement = tooltipRef.current;

    const tooltipWidth = tooltipElement ? tooltipElement.offsetWidth || 600 : 600;

    // Get container position for side positioning
    const container = containerRef.current;
    const containerRect = container ? container.getBoundingClientRect() : null;

    if (!containerRect) {
      // Fallback to original positioning if container not found
      return { pointerEvents: "none", visibility: "hidden" };
    }

    // Position to the right of the overlay if there's room, otherwise to the left
    let x: number;
    const rightSpace = window.innerWidth - (containerRect.right + offset);
    const leftSpace = containerRect.left - offset;

    if (rightSpace >= tooltipWidth) {
      // Position to the right
      x = containerRect.right + offset;
    } else if (leftSpace >= tooltipWidth) {
      // Position to the left
      x = containerRect.left - tooltipWidth - offset;
    } else {
      // Not enough space on either side, position to the right anyway
      x = containerRect.right + offset;
    }

    return {
      left: `${x}px`,
      top: `${containerRect.top}px`,
      visibility: "visible",
      pointerEvents: isTouchInteraction ? "auto" : "none", // Enable pointer events for touch interactions
    };
  }, [cursorPosition, hoveredDate, isTouchInteraction, containerRef]);

  const stopEventPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const handleGoButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (goButtonTouchActiveRef.current) {
      goButtonTouchActiveRef.current = false;
      return;
    }
    onTouchGo(hoveredDate);
  };

  const handleGoButtonTouchStart = (event: React.TouchEvent<HTMLButtonElement>) => {
    goButtonTouchActiveRef.current = true;
    event.stopPropagation();
    event.preventDefault();
  };

  const handleGoButtonTouchEnd = (event: React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    onTouchGo(hoveredDate);
    goButtonTouchActiveRef.current = false;
  };

  const handleGoButtonTouchCancel = (event: React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    goButtonTouchActiveRef.current = false;
  };

  const handleCancelButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (cancelButtonTouchActiveRef.current) {
      cancelButtonTouchActiveRef.current = false;
      return;
    }
    onTouchCancel();
  };

  const handleCancelButtonTouchStart = (event: React.TouchEvent<HTMLButtonElement>) => {
    cancelButtonTouchActiveRef.current = true;
    event.stopPropagation();
    event.preventDefault();
  };

  const handleCancelButtonTouchEnd = (event: React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    onTouchCancel();
    cancelButtonTouchActiveRef.current = false;
  };

  const handleCancelButtonTouchCancel = (event: React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    cancelButtonTouchActiveRef.current = false;
  };

  return (
    <div
      ref={tooltipRef}
      className={styles.dateTooltip}
      style={getTooltipStyle()}
      onTouchStart={stopEventPropagation}
      onTouchMove={stopEventPropagation}
      onTouchEnd={stopEventPropagation}
    >
      {hoveredDate && (
        <>
          <div className={styles.tooltipHeader}>
            <div className={styles.tooltipDate}>{formatTooltipDate(hoveredDate)}</div>
            <div className={styles.tooltipHeaderRight}>
              {orbitsDaily && orbitsDaily[hoveredDate] && (
                <div className={styles.tooltipOrbits}>Orbits: {orbitsDaily[hoveredDate]}</div>
              )}
              {isTouchInteraction && (
                <div className={styles.tooltipButtons}>
                  <button
                    className={styles.tooltipGoButton}
                    onClick={handleGoButtonClick}
                    onTouchStart={handleGoButtonTouchStart}
                    onTouchMove={stopEventPropagation}
                    onTouchEnd={handleGoButtonTouchEnd}
                    onTouchCancel={handleGoButtonTouchCancel}
                    type="button"
                    disabled={!hoveredDate}
                  >
                    Go
                  </button>
                  <button
                    className={styles.tooltipCancelButton}
                    onClick={handleCancelButtonClick}
                    onTouchStart={handleCancelButtonTouchStart}
                    onTouchMove={stopEventPropagation}
                    onTouchEnd={handleCancelButtonTouchEnd}
                    onTouchCancel={handleCancelButtonTouchCancel}
                    type="button"
                    title="Close"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
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

          <div className={styles.contentIndicatorsWrapper}>
            <ContentIndicatorsSection hoveredDate={hoveredDate} />
          </div>

          <FirstCommSection hoveredDate={hoveredDate} hasCommData={hasCommData} />
        </>
      )}
    </div>
  );
};

export default DateTooltip;

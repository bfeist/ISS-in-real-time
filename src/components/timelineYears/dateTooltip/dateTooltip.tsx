import React, { FunctionComponent, useRef, useCallback, useMemo, useState, useEffect } from "react";
import styles from "./dateTooltip.module.css";
import { useGeneralDataAvailabilities, useGeneralOrbitsDaily } from "api/useGeneralData";
import ExpeditionsSection from "./expeditionsSection";
import CrewOnboardSection from "./crewOnboardSection";
import VehiclesDockedSection from "./vehiclesDockedSection";
import ContentIndicatorsSection from "../subcomponents/contentIndicatorsSection";
import FirstCommSection from "./firstCommSection";

const DateTooltip: FunctionComponent<{
  hoveredDate: string | null;
  cursorPosition: { x: number; y: number } | null;
  isTouchDevice: boolean;
  onTouchGo: (date: string | null) => void;
  onTouchCancel: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
}> = ({ hoveredDate, cursorPosition, isTouchDevice, onTouchGo, onTouchCancel, containerRef }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const goButtonTouchActiveRef = useRef(false);
  const cancelButtonTouchActiveRef = useRef(false);
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === "undefined") {
      return 1024;
    }
    return window.innerWidth;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const isLargeScreen = viewportWidth >= 1024;
  const isExtraSmallScreen = viewportWidth < 740;

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
    if (!cursorPosition || !hoveredDate || !tooltipRef.current) {
      return { pointerEvents: "none", visibility: "hidden" };
    }

    const offset = isLargeScreen ? 30 : 5;
    const tooltipElement = tooltipRef.current;

    const tooltipWidth = tooltipElement.offsetWidth;

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
      pointerEvents: isTouchDevice ? "auto" : "none", // Enable pointer events for touch interactions
    };
  }, [cursorPosition, hoveredDate, isTouchDevice, containerRef, isLargeScreen]);

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

  const tooltipClassNames = [styles.dateTooltip];
  if (!isLargeScreen) {
    tooltipClassNames.push(styles.compactTooltip);
  }
  if (isExtraSmallScreen) {
    tooltipClassNames.push(styles.extraCompactTooltip);
  }

  const tooltipGridClassNames = [styles.tooltipGrid];
  if (!isLargeScreen) {
    tooltipGridClassNames.push(styles.singleColumn);
  }

  return (
    <div
      ref={tooltipRef}
      className={tooltipClassNames.join(" ")}
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
              {!isExtraSmallScreen && orbitsDaily && orbitsDaily[hoveredDate] && (
                <div className={styles.tooltipOrbits}>Orbits: {orbitsDaily[hoveredDate]}</div>
              )}
              {isTouchDevice && (
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

          {!isExtraSmallScreen && (
            <div className={styles.tooltipContent}>
              <div className={tooltipGridClassNames.join(" ")}>
                <div className={styles.columnHeader}>Expeditions &amp; Crew</div>
                {isLargeScreen && <div className={styles.columnHeader}>Vehicles Docked</div>}

                <div className={styles.combinedColumn}>
                  <div className={styles.subSection}>
                    <div className={styles.subSectionTitle}>Expeditions</div>
                    <ExpeditionsSection hoveredDate={hoveredDate} />
                  </div>
                  <div className={styles.subSection}>
                    <div className={styles.subSectionTitle}>Crew Onboard</div>
                    <CrewOnboardSection hoveredDate={hoveredDate} />
                  </div>
                </div>
                {isLargeScreen && <VehiclesDockedSection hoveredDate={hoveredDate} />}
              </div>
            </div>
          )}

          {!isExtraSmallScreen && (
            <div className={styles.contentIndicatorsWrapper}>
              <ContentIndicatorsSection hoveredDate={hoveredDate} compact={true} />
            </div>
          )}

          <FirstCommSection
            hoveredDate={hoveredDate}
            hasCommData={hasCommData}
            extraCompact={isExtraSmallScreen}
          />
        </>
      )}
    </div>
  );
};

export default DateTooltip;

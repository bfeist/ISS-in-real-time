import React, { FunctionComponent, useRef, useCallback, useMemo } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import styles from "./dateTooltip.module.css";
import {
  useGeneralCrewArrDep,
  useGeneralExpeditionInfo,
  useGeneralFlights,
  useGeneralFlightsSupply,
  useGeneralDataAvailabilities,
} from "api/useGeneralData";
import {
  getCrewMembersOnboardByDate,
  getActiveFlightsByDate,
  getActiveSupplyFlightsByDate,
} from "utils/onboard";
import { flagUrlByCountryName } from "utils/countries";

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
  const { data: crewArrDep } = useGeneralCrewArrDep();
  const { data: expeditionInfo } = useGeneralExpeditionInfo();
  const { data: flights } = useGeneralFlights();
  const { data: flightsSupply } = useGeneralFlightsSupply();
  const { data: dataAvailabilityItems } = useGeneralDataAvailabilities();

  // Memoized calculations based on hoveredDate and data
  const expeditionsOnHoveredDate = useMemo(() => {
    if (!hoveredDate || !expeditionInfo) return [];
    return expeditionInfo.filter(
      (expedition: ExpeditionInfo) =>
        expedition.start <= hoveredDate && expedition.end >= hoveredDate
    );
  }, [hoveredDate, expeditionInfo]);

  const crewOnboardList = useMemo(() => {
    if (!hoveredDate || !crewArrDep) return [];
    return getCrewMembersOnboardByDate({
      crewArrDep,
      dateStr: hoveredDate,
    });
  }, [hoveredDate, crewArrDep]);

  const flightsDocked = useMemo(() => {
    if (!hoveredDate || !flights) return [];
    const activeFlights = getActiveFlightsByDate({
      dateStr: hoveredDate,
      flights,
    });
    if (activeFlights.length === 0) return [];

    return activeFlights
      .sort((a, b) => a.mission_name.localeCompare(b.mission_name))
      .map(
        (flight) =>
          `${flight.iss_flight} - ${flight.mission_name}` +
          (flight.spacecraft_name ? " - " + flight.spacecraft_name : "")
      );
  }, [hoveredDate, flights]);

  const supplyFlightsDocked = useMemo(() => {
    if (!hoveredDate || !flightsSupply) return [];
    const supplyFlights = getActiveSupplyFlightsByDate({
      dateStr: hoveredDate,
      flightsSupply,
    });
    if (supplyFlights.length === 0) return [];

    return supplyFlights
      .sort((a, b) => a.flight_no.localeCompare(b.flight_no))
      .map((flight) => flight.flight_no + (flight.spacecraft ? " - " + flight.spacecraft : ""));
  }, [hoveredDate, flightsSupply]);

  // Get content availability for the hovered date
  const contentAvailability = useMemo(() => {
    if (!hoveredDate || !dataAvailabilityItems) return null;
    return dataAvailabilityItems.find((item) => item.date === hoveredDate);
  }, [hoveredDate, dataAvailabilityItems]);

  // Define content types with their availability
  const contentTypes = useMemo(() => {
    if (!contentAvailability) return [];

    return [
      {
        key: "comm",
        label: "Comm",
        available: contentAvailability.comm || contentAvailability.vvComm,
      },
      {
        key: "youtube",
        label: "Video",
        available: contentAvailability.youtube,
      },
      {
        key: "eva",
        label: "EVA",
        available: contentAvailability.eva,
      },
      {
        key: "blog",
        label: "Article",
        available: contentAvailability.blog || contentAvailability.activitySummary,
      },
      {
        key: "earthPhotography",
        label: "Earth Photography",
        available: contentAvailability.earthPhotography,
      },
    ];
  }, [contentAvailability]);

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
    // Larger tooltip size for rich content with better responsive sizing
    const tooltipHeight = tooltipElement
      ? tooltipElement.offsetHeight || (isTouchInteraction ? 320 : 300)
      : isTouchInteraction
        ? 320
        : 300;
    const tooltipWidth = tooltipElement ? tooltipElement.offsetWidth || 580 : 580;

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

    // Check if tooltip would go off bottom of viewport
    const bottomBoundary = window.scrollY + window.innerHeight - tooltipHeight - 20;
    if (y > bottomBoundary) {
      y = cursorPosition.y - tooltipHeight - offset; // Force above cursor
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
  }, [cursorPosition, hoveredDate, isTouchInteraction, showTimelineYears, containerRef]);

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

              <div className={styles.columnContent}>
                {expeditionsOnHoveredDate.length > 0 ? (
                  expeditionsOnHoveredDate.map((expedition: ExpeditionInfo) => (
                    <div key={expedition.expedition} className={styles.expeditionItem}>
                      {`Expedition ${expedition.expedition}`}
                    </div>
                  ))
                ) : (
                  <div className={styles.noData}>No active expeditions</div>
                )}
              </div>

              <div className={styles.columnContent}>
                {crewOnboardList.length > 0 ? (
                  crewOnboardList.map((crewMember) => (
                    <div
                      key={`${crewMember.arrivalDate}_${crewMember.name_first}_${crewMember.name_last}`}
                      className={styles.crewItem}
                    >
                      <img
                        className={styles.flag}
                        src={flagUrlByCountryName[crewMember.nationality]}
                        alt={crewMember.nationality}
                      />
                      <span className={styles.crewName}>
                        {crewMember.name_first} {crewMember.name_last}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className={styles.noData}>No crew onboard</div>
                )}
              </div>

              <div className={styles.columnContent}>
                {flightsDocked.length > 0 || supplyFlightsDocked.length > 0 ? (
                  <>
                    {flightsDocked.length > 0 && (
                      <div className={styles.vehicleSection}>
                        <div className={styles.vehicleType}>Crew</div>
                        {flightsDocked.map((name) => (
                          <div key={name} className={styles.vehicleItem}>
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                    {supplyFlightsDocked.length > 0 && (
                      <div className={styles.vehicleSection}>
                        <div className={styles.vehicleType}>Supply</div>
                        {supplyFlightsDocked.map((name) => (
                          <div key={name} className={styles.vehicleItem}>
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.noData}>No vehicles docked</div>
                )}
              </div>
            </div>
          </div>

          {/* Content Indicators */}
          {contentTypes.length > 0 && (
            <div className={styles.contentIndicators}>
              <div className={styles.contentIndicatorsList}>
                {contentTypes.map((contentType) => (
                  <span
                    key={contentType.key}
                    className={`${styles.contentIndicator} ${
                      contentType.available ? styles.available : styles.unavailable
                    }`}
                  >
                    {contentType.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DateTooltip;

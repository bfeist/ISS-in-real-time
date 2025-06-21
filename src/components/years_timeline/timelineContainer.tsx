import { FunctionComponent, JSX, useRef, useEffect, useState, useCallback } from "react";
import styles from "./timelineContainer.module.css";
import YearsLabels from "./yearsLabels";
import YearsHoverAndSearch from "./yearsHoverAndSearch";
import { initializePaperCanvas, clearPaperCanvas } from "./yearsTimelineDraw";
import {
  getActiveFlightsByDate,
  getActiveSupplyFlightsByDate,
  getCrewMembersOnboardByDate,
} from "utils/onboard";

interface TimelineContainerProps {
  dataAvailabilityItems: DataAvailability[];
  clickCallback: ({ clickedDate }: { clickedDate: string | null }) => void;
  indexPageData: GetDataIndexPageDataResponse;
  selectedDate?: string;
}

const TimelineContainer: FunctionComponent<TimelineContainerProps> = ({
  dataAvailabilityItems,
  clickCallback,
  indexPageData,
  selectedDate,
}): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const yearsScrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showTimeline, setShowTimeline] = useState(
    () => selectedDate === null || selectedDate === undefined
  );
  const [canvasWidth, setCanvasWidth] = useState(() => Math.max(window.innerWidth, 1500));

  const [crewOnboardList, setCrewOnboardList] = useState<string[]>([]);
  const [flightsDocked, setFlightsDocked] = useState<string[]>([]);
  const [supplyFlightsDocked, setSupplyFlightsDocked] = useState<string[]>([]);
  const [selectedCrewMember, setSelectedCrewMember] = useState<CrewMember | null>(null);
  const [selectedCrewStays, setSelectedCrewStays] = useState<CrewArrDepItem[]>([]);

  // Hover callback that was moved from index.tsx
  const hoverCallback = useCallback(
    ({ hoveredDate }: { hoveredDate: string | null }) => {
      // Clear previous state
      setCrewOnboardList([]);
      setFlightsDocked([]);
      setSupplyFlightsDocked([]);

      if (hoveredDate) {
        // Show crew onboard
        const crewOnboard = getCrewMembersOnboardByDate({
          crewArrDep: indexPageData.crewArrDep,
          dateStr: hoveredDate,
        });
        if (crewOnboard.length > 0) {
          const crewNames = crewOnboard
            .sort((a, b) => {
              // First sort by arrival date (earliest first)
              const arrivalDateA = a.arrivalDate || "";
              const arrivalDateB = b.arrivalDate || "";
              if (arrivalDateA !== arrivalDateB) {
                return arrivalDateA.localeCompare(arrivalDateB);
              }
              // If arrival dates are the same, sort by name
              const nameA = `${a.name_first} ${a.name_last}` || "";
              const nameB = `${b.name_first} ${b.name_last}` || "";
              return nameA.localeCompare(nameB);
            })
            .map((crewMember) => `${crewMember.name_first} ${crewMember.name_last}`);
          setCrewOnboardList(crewNames);
        }

        // Show flights docked
        const flights = getActiveFlightsByDate({
          dateStr: hoveredDate,
          flights: indexPageData.flights,
        });
        if (flights.length > 0) {
          const flightNames = flights
            .sort((a, b) => a.mission_name.localeCompare(b.mission_name))
            .map(
              (flight) =>
                `${flight.iss_flight} - ${flight.mission_name}` +
                (flight.spacecraft_name ? " - " + flight.spacecraft_name : "")
            );
          setFlightsDocked(flightNames);
        }

        const supplyFlights = getActiveSupplyFlightsByDate({
          dateStr: hoveredDate,
          flightsSupply: indexPageData.flightsSupply,
        });
        if (supplyFlights.length > 0) {
          const supplyFlightNames = supplyFlights
            .sort((a, b) => a.flight_no.localeCompare(b.flight_no))
            .map(
              (flight) => flight.flight_no + (flight.spacecraft ? " - " + flight.spacecraft : "")
            );
          setSupplyFlightsDocked(supplyFlightNames);
        }
      }
    },
    [indexPageData]
  );

  // Effect to update selectedCrewStays when selectedCrewMember changes
  useEffect(() => {
    if (selectedCrewMember) {
      const crewStays = indexPageData.crewArrDep.filter(
        (item) => `${item.name_first} ${item.name_last}` === selectedCrewMember.name
      );
      setSelectedCrewStays(crewStays);
    } else {
      setSelectedCrewStays([]);
    }
  }, [selectedCrewMember, indexPageData.crewArrDep]);

  // Update canvas width on window resize
  useEffect(() => {
    const updateCanvasWidth = () => {
      const windowWidth = window.innerWidth;
      setCanvasWidth(Math.max(windowWidth, 1500));
    };

    window.addEventListener("resize", updateCanvasWidth);

    return () => {
      window.removeEventListener("resize", updateCanvasWidth);
    };
  }, []);

  const handleYearsHover = useCallback((isHovering: boolean) => {
    if (isHovering) {
      setShowTimeline(true);
    }
    // Don't set to false here - let the container mouse leave handle it
  }, []);

  // Handle mouse leave from the entire timeline container
  const handleContainerMouseLeave = useCallback(() => {
    setShowTimeline(false);
  }, []);

  // Sync scroll between years and canvas
  const handleCanvasScroll = useCallback(() => {
    if (scrollContainerRef.current && yearsScrollContainerRef.current) {
      yearsScrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollLeft;
    }
  }, []);

  const handleYearsScroll = useCallback(() => {
    if (scrollContainerRef.current && yearsScrollContainerRef.current && showTimeline) {
      scrollContainerRef.current.scrollLeft = yearsScrollContainerRef.current.scrollLeft;
    }
  }, [showTimeline]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas && showTimeline) {
      // Use the current canvasWidth state which matches years labels
      const { drawPaperItems, cleanupInputHandlers } = initializePaperCanvas({
        canvasElement: canvas,
        dataAvailabilityItems,
        selectedCrewStays,
        hoverCallback,
        clickCallback,
        canvasWidth,
      });

      // Update canvas element width to match calculated width
      canvas.style.width = `${canvasWidth}px`;

      const handleResize = () => {
        drawPaperItems();
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        cleanupInputHandlers();
        clearPaperCanvas();
      };
    }
  }, [
    dataAvailabilityItems,
    selectedCrewStays,
    hoverCallback,
    clickCallback,
    showTimeline,
    canvasWidth,
  ]);

  // Update canvas width when canvasWidth state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && showTimeline) {
      console.log("Setting canvas width to:", canvasWidth);
      canvas.style.width = `${canvasWidth}px`;
      canvas.width = canvasWidth; // Also set the actual canvas width attribute
      console.log("Canvas style width:", canvas.style.width);
      console.log("Canvas clientWidth:", canvas.clientWidth);
    }
  }, [canvasWidth, showTimeline]);

  // Update showTimeline when selectedDate changes
  useEffect(() => {
    // If selectedDate is null/undefined, default to open
    if (selectedDate === null || selectedDate === undefined) {
      setShowTimeline(true);
    }
    // If a date is selected, we can close the timeline (user has made a selection)
    // but don't force it closed - let hover behavior control it
  }, [selectedDate]);

  return (
    <div
      ref={containerRef}
      className={styles.timelineContainer}
      onMouseEnter={() => {
        /* Keep timeline open when mouse enters container */
      }}
      onMouseLeave={handleContainerMouseLeave}
    >
      {/* Years labels row */}
      <div className={styles.yearsRow}>
        <div
          ref={yearsScrollContainerRef}
          className={styles.yearsScrollContainer}
          onScroll={handleYearsScroll}
        >
          <YearsLabels canvasWidth={canvasWidth} onHover={handleYearsHover} />
        </div>
      </div>

      {/* Timeline canvas dropdown */}
      {showTimeline && (
        <div className={styles.timelineDropdown}>
          <div
            ref={scrollContainerRef}
            className={styles.canvasScrollContainer}
            onScroll={handleCanvasScroll}
          >
            <canvas ref={canvasRef} className={styles.timelineCanvas} style={{ height: 150 }} />
          </div>
          <YearsHoverAndSearch
            crewOnboardList={crewOnboardList}
            flightsDocked={flightsDocked}
            supplyFlightsDocked={supplyFlightsDocked}
            crewArrDep={indexPageData.crewArrDep}
            selectedCrewMember={selectedCrewMember}
            setSelectedCrewMember={setSelectedCrewMember}
          />
        </div>
      )}
    </div>
  );
};

export default TimelineContainer;

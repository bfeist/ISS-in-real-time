import styles from "./index.module.css";
import { FunctionComponent, JSX, useEffect, useRef, useState, useCallback } from "react";
import { initializePaperCanvas, clearPaperCanvas } from "../components/dateTimelineDraw";
import { useLoaderData } from "react-router";
import {
  getActiveFlightsByDate,
  getActiveSupplyFlightsByDate,
  getCrewMembersOnboardByDate,
} from "utils/onboard";
import YearsHoverAndSearch from "../components/yearsHoverAndSearch";
import LayoutTest from "./layout_test";

const SliderPage: FunctionComponent = (): JSX.Element => {
  const indexPageData = useLoaderData() as GetDataIndexPageDataResponse;

  const [selectedDate, setSelectedDate] = useState<string>();
  const [selectedDateDataAvailability, setSelectedDateDataAvailability] =
    useState<DataAvailability | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [calculatedDate, setCalculatedDate] = useState<{
    year: number;
    month: number;
    day: number | null;
  } | null>(null);
  const [crewOnboardList, setCrewOnboardList] = useState<string[]>([]);
  const [flightsDocked, setFlightsDocked] = useState<string[]>([]);
  const [supplyFlightsDocked, setSupplyFlightsDocked] = useState<string[]>([]);
  const [selectedCrewMember, setSelectedCrewMember] = useState<CrewMember | null>(null);
  const [selectedCrewStays, setSelectedCrewStays] = useState<CrewArrDepItem[]>([]);

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

  const hoverCallback = useCallback(
    ({ hoveredDate }: { hoveredDate: string | null }) => {
      // Clear previous state
      setCalculatedDate(null);
      setCrewOnboardList([]);
      setFlightsDocked([]);
      setSupplyFlightsDocked([]);

      if (hoveredDate) {
        // Parse the date to get year, month, day
        const [year, month, day] = hoveredDate.split("-").map(Number);
        setCalculatedDate({ year, month: month - 1, day }); // month is 0-indexed for display

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

  const clickCallback = useCallback(
    ({ clickedDate }: { clickedDate: string | null }) => {
      if (clickedDate) {
        setSelectedDate(clickedDate);

        // Find data availability for this date
        const dataAvailability = indexPageData.dataAvailabilityItems.find(
          (item) => item.date === clickedDate
        );
        setSelectedDateDataAvailability(
          dataAvailability || {
            date: clickedDate,
            comm: false,
            vvComm: false,
            youtube: false,
            eva: false,
            blog: false,
            activitySummary: false,
            earthPhotography: false,
          }
        );
      }
    },
    [indexPageData.dataAvailabilityItems]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const { drawPaperItems, cleanupInputHandlers } = initializePaperCanvas({
        canvasElement: canvas,
        dataAvailabilityItems: indexPageData.dataAvailabilityItems,
        selectedCrewStays,
        hoverCallback,
        clickCallback,
      });

      window.addEventListener("resize", drawPaperItems);

      return () => {
        window.removeEventListener("resize", drawPaperItems);
        cleanupInputHandlers();
        clearPaperCanvas();
      };
    }
  }, [hoverCallback, clickCallback, indexPageData.dataAvailabilityItems, selectedCrewStays]);

  return (
    <div className={styles.page}>
      <canvas ref={canvasRef} className={styles.paperCanvas} />
      <div className={styles.selectedDateDisplay}>
        {selectedDate
          ? `Selected Date: ${selectedDate}`
          : calculatedDate && calculatedDate.day !== null
            ? `${calculatedDate.year}-${String(calculatedDate.month + 1).padStart(
                2,
                "0"
              )}-${String(calculatedDate.day).padStart(2, "0")}`
            : "Hover over the timeline to select a date"}
      </div>
      {selectedDate && selectedDateDataAvailability ? (
        <LayoutTest
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          dataAvailability={selectedDateDataAvailability}
        />
      ) : (
        <YearsHoverAndSearch
          crewOnboardList={crewOnboardList}
          flightsDocked={flightsDocked}
          supplyFlightsDocked={supplyFlightsDocked}
          crewArrDep={indexPageData.crewArrDep}
          selectedCrewMember={selectedCrewMember}
          setSelectedCrewMember={setSelectedCrewMember}
        />
      )}
    </div>
  );
};

export default SliderPage;

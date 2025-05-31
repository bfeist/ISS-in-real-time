import styles from "./index_slider.module.css";
import { FunctionComponent, JSX, useEffect, useRef, useState, useCallback } from "react";
import { initializePaperCanvas, clearPaperCanvas } from "../components/dateTimelineDraw";
import { calculateMonthByX, calculateDayByY } from "../utils/indexSliderCalcs";
import { useLoaderData, useNavigate } from "react-router";
import paper from "paper";
import {
  getActiveFlightsByDate,
  getActiveSupplyFlightsByDate,
  getCrewMembersOnboardByDate,
} from "utils/onboard";
import CrewSearch from "components/crewSearch";

const SliderPage: FunctionComponent = (): JSX.Element => {
  const indexPageData = useLoaderData() as GetDataIndexPageDataResponse;

  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string>();
  useEffect(() => {
    if (selectedDate) {
      navigate(`/date/${selectedDate}`);
    }
  }, [selectedDate, navigate]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [calculatedDate, setCalculatedDate] = useState<{
    year: number;
    month: number;
    day: number | null;
  } | null>(null);
  const [crewOnboardList, setCrewOnboardList] = useState<string[]>([]);
  const [flightsDocked, setFlightsDocked] = useState<string[]>([]);
  const [supplyFlightsDocked, setSupplyFlightsDocked] = useState<string[]>([]);

  const hoverCallback = useCallback(
    ({
      mouseX,
      mouseY,
      canvasWidth,
    }: {
      mouseX: number | null;
      mouseY: number | null;
      canvasWidth: number | null;
    }) => {
      // Calculate date here
      if (mouseX !== null && mouseY !== null && canvasWidth !== null) {
        const monthInfo = calculateMonthByX(mouseX, canvasWidth);
        const day = calculateDayByY(
          mouseY,
          paper.view?.bounds.height ?? null,
          monthInfo.year,
          monthInfo.month
        );

        if (day) {
          setCalculatedDate({ ...monthInfo, day });
        }

        const date = `${monthInfo.year}-${String(monthInfo.month + 1).padStart(2, "0")}-${String(
          day
        ).padStart(2, "0")}`;

        // Show crew onboard
        const crewOnboard = getCrewMembersOnboardByDate({
          crewArrDep: indexPageData.crewArrDep,
          dateStr: date,
        });
        if (crewOnboard.length > 0) {
          const crewNames = crewOnboard
            .sort((a, b) => {
              // First sort by arrival date (earliest first)
              if (a.arrivalDate !== b.arrivalDate) {
                return a.arrivalDate.localeCompare(b.arrivalDate);
              }
              // If arrival dates are the same, sort by name
              return a.name.localeCompare(b.name);
            })
            .map((crewMember) => crewMember.name);
          setCrewOnboardList(crewNames);
        }

        // Show flights docked
        const flights = getActiveFlightsByDate({ dateStr: date, flights: indexPageData.flights });
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
          dateStr: date,
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
      } else {
        setCalculatedDate(null);
        setCrewOnboardList([]);
        setFlightsDocked([]);
        setSupplyFlightsDocked([]);
      }
    },
    [indexPageData]
  );

  const clickCallback = useCallback(
    ({
      mouseX,
      mouseY,
      canvasWidth,
    }: {
      mouseX: number | null;
      mouseY: number | null;
      canvasWidth: number | null;
    }) => {
      if (mouseX !== null && mouseY !== null && canvasWidth !== null) {
        const monthInfo = calculateMonthByX(mouseX, canvasWidth);
        const day = calculateDayByY(
          mouseY,
          paper.view?.bounds.height ?? null,
          monthInfo.year,
          monthInfo.month
        );

        if (day) {
          setSelectedDate(
            `${monthInfo.year}-${String(monthInfo.month + 1).padStart(2, "0")}-${String(
              day
            ).padStart(2, "0")}`
          );
        }
      }
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const { drawPaperItems, cleanupInputHandlers } = initializePaperCanvas({
        canvasElement: canvas,
        dataAvailabilityItems: indexPageData.dataAvailabilityItems,
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
  }, [hoverCallback, clickCallback, indexPageData.dataAvailabilityItems]);

  return (
    <div className={styles.page}>
      <canvas ref={canvasRef} className={styles.paperCanvas} />
      <div className={styles.selectedDateDisplay}>
        {calculatedDate && calculatedDate.day !== null
          ? `Selected Date: ${calculatedDate.year}-${String(calculatedDate.month + 1).padStart(
              2,
              "0"
            )}-${String(calculatedDate.day).padStart(2, "0")}`
          : "Hover over the timeline to see the date"}
      </div>
      <div className={styles.dataLists}>
        <div className={styles.dataItem}>
          <h2>Crew Onboard</h2>
          {crewOnboardList.length > 0 &&
            crewOnboardList.map((name) => <div key={name}>{name}</div>)}
        </div>
        <div className={styles.dataItem}>
          <h2>Crew Vehicles Docked</h2>
          {flightsDocked.length > 0 && (
            <div>
              {flightsDocked.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.dataItem}>
          <h2>Supply Vehicles Docked</h2>
          {supplyFlightsDocked.length > 0 && (
            <div>
              {supplyFlightsDocked.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
          )}
        </div>
        <CrewSearch crewArrDep={indexPageData.crewArrDep} />
      </div>
    </div>
  );
};

export default SliderPage;

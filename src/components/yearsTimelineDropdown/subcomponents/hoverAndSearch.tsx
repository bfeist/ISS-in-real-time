import { FunctionComponent, useMemo } from "react";
import CrewSearch from "./crewSearch";
import styles from "./hoverAndSearch.module.css";
import {
  useGeneralCrewArrDep,
  useGeneralExpeditionInfo,
  useGeneralFlights,
  useGeneralFlightsSupply,
} from "api/useGeneralData";
import {
  getCrewMembersOnboardByDate,
  getActiveFlightsByDate,
  getActiveSupplyFlightsByDate,
} from "utils/onboard";
import { useStateHover } from "store/hooks/useStateHover";
import { useStateContentHighlights } from "store/hooks/useStateContentHighlights";

const HoverAndSearch: FunctionComponent = () => {
  const { hoveredDate } = useStateHover();
  const { contentHighlights, toggleContentHighlight } = useStateContentHighlights();

  // Extract only the data we need from queries - React Query handles caching
  const { data: crewArrDep } = useGeneralCrewArrDep();
  const { data: expeditionInfo } = useGeneralExpeditionInfo();
  const { data: flights } = useGeneralFlights();
  const { data: flightsSupply } = useGeneralFlightsSupply();

  // Define the available content types for highlighting
  const contentTypes = [
    { key: "comm", label: "Comm" },
    { key: "vvComm", label: "VV Comm" },
    { key: "youtube", label: "YouTube" },
    { key: "eva", label: "EVA" },
    { key: "blog", label: "Blog" },
    { key: "activitySummary", label: "Activity Summary" },
    { key: "earthPhotography", label: "Earth Photography" },
  ];

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
    const crewOnboard = getCrewMembersOnboardByDate({
      crewArrDep,
      dateStr: hoveredDate,
    });
    if (crewOnboard.length === 0) return [];

    return crewOnboard
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

  return (
    <div className={styles.dataLists}>
      <div className={styles.dataItem} style={{ flex: "0 0 120px" }}>
        <div className={styles.contentHeading}>Date</div>
        <div>{hoveredDate}</div>
      </div>
      <div className={styles.dataItem} style={{ flex: "0 0 180px" }}>
        <div className={styles.contentHeading}>Expeditions</div>
        {expeditionsOnHoveredDate.length > 0 && (
          <>
            {expeditionsOnHoveredDate.map((expedition: ExpeditionInfo) => (
              <div key={expedition.expedition}>{`Expedition ${expedition.expedition}`}</div>
            ))}
          </>
        )}
      </div>
      <div className={styles.dataItem}>
        <div className={styles.contentHeading}>Crew Onboard</div>
        {crewOnboardList.length > 0 && (
          <>
            <div className={styles.contentColumns}>
              {crewOnboardList.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className={styles.dataItem}>
        <div className={styles.contentHeading}>Vehicles Docked</div>
        <div className={styles.contentColumns}>
          {flightsDocked.length > 0 && (
            <div className={styles.vehicleCategory}>
              <h3 className={styles.subheading}>Crew</h3>
              {flightsDocked.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
          )}
          {supplyFlightsDocked.length > 0 && (
            <div className={styles.vehicleCategory}>
              <h3 className={styles.subheading}>Supply</h3>
              {supplyFlightsDocked.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={styles.dataItem} style={{ flex: "0 0 190px" }}>
        <div className={styles.contentHeading}>Content Highlights</div>
        <div className={styles.contentColumns}>
          {contentTypes.map((contentType) => (
            <button
              key={contentType.key}
              className={`${styles.highlightButton} ${
                contentHighlights.includes(contentType.key) ? styles.highlightButtonActive : ""
              }`}
              onClick={() => toggleContentHighlight(contentType.key)}
              type="button"
            >
              {contentType.label}
            </button>
          ))}
        </div>
      </div>
      <CrewSearch />
    </div>
  );
};

export default HoverAndSearch;

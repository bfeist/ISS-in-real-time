import { FunctionComponent, useEffect, useState } from "react";
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
import { useStateHover } from "store";

const HoverAndSearch: FunctionComponent = () => {
  const { hoveredDate } = useStateHover();
  const crewArrDepQuery = useGeneralCrewArrDep();
  const expeditionInfoQuery = useGeneralExpeditionInfo();
  const flightsQuery = useGeneralFlights();
  const flightsSupplyQuery = useGeneralFlightsSupply();

  // Extract data from queries
  const { data: crewArrDep } = crewArrDepQuery;
  const { data: expeditionInfo } = expeditionInfoQuery;
  const { data: flights } = flightsQuery;
  const { data: flightsSupply } = flightsSupplyQuery;

  const [expeditionsOnHoveredDate, setExpeditionsOnHoveredDate] = useState<ExpeditionInfo[]>([]);
  const [crewOnboardList, setCrewOnboardList] = useState<string[]>([]);
  const [flightsDocked, setFlightsDocked] = useState<string[]>([]);
  const [supplyFlightsDocked, setSupplyFlightsDocked] = useState<string[]>([]);

  useEffect(() => {
    // Clear previous state
    setExpeditionsOnHoveredDate([]);
    setCrewOnboardList([]);
    setFlightsDocked([]);
    setSupplyFlightsDocked([]);

    if (hoveredDate && expeditionInfo && crewArrDep && flights && flightsSupply) {
      // Show expeditions
      const expeditions = expeditionInfo.filter(
        (expedition: ExpeditionInfo) =>
          expedition.start <= hoveredDate && expedition.end >= hoveredDate
      );
      setExpeditionsOnHoveredDate(expeditions);

      // Show crew onboard
      const crewOnboard = getCrewMembersOnboardByDate({
        crewArrDep,
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
      const activeFlights = getActiveFlightsByDate({
        dateStr: hoveredDate,
        flights,
      });
      if (activeFlights.length > 0) {
        const flightNames = activeFlights
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
        flightsSupply,
      });
      if (supplyFlights.length > 0) {
        const supplyFlightNames = supplyFlights
          .sort((a, b) => a.flight_no.localeCompare(b.flight_no))
          .map((flight) => flight.flight_no + (flight.spacecraft ? " - " + flight.spacecraft : ""));
        setSupplyFlightsDocked(supplyFlightNames);
      }
    }
  }, [hoveredDate, expeditionInfo, crewArrDep, flights, flightsSupply]);

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
      <CrewSearch />
    </div>
  );
};

export default HoverAndSearch;

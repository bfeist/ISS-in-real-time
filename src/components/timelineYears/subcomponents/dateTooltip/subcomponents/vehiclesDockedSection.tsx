import React, { FunctionComponent, useMemo } from "react";
import { useGeneralFlights, useGeneralFlightsSupply } from "api/useGeneralData";
import { getActiveFlightsByDate, getActiveSupplyFlightsByDate } from "utils/onboard";
import styles from "./vehiclesDockedSection.module.css";

interface VehiclesDockedSectionProps {
  hoveredDate: string | null;
}

const VehiclesDockedSection: FunctionComponent<VehiclesDockedSectionProps> = ({ hoveredDate }) => {
  const { data: flights } = useGeneralFlights();
  const { data: flightsSupply } = useGeneralFlightsSupply();

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
  );
};

export default VehiclesDockedSection;

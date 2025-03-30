import { useMemo } from "react";
import styles from "./flights.module.css";
import { flagUrlByCountryName } from "utils/countries";

type Props = {
  date: string;
  flights: Flight[];
};

const isSameDay = (date1: Date | null, date2: Date): boolean => {
  if (!date1) return false;
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
};

const Flights = ({ date, flights }: Props): JSX.Element | null => {
  const activeFlights = useMemo(() => {
    const currentDate = new Date(date);

    return flights.filter((flight) => {
      const launchDate = new Date(flight.launch_date_utc);
      const landingDate = flight.landing_date_utc ? new Date(flight.landing_date_utc) : null;
      const dockingDate = flight.docking_date_utc ? new Date(flight.docking_date_utc) : null;
      const undockingDate = flight.undocking_date_utc ? new Date(flight.undocking_date_utc) : null;

      // Check if flight is active on the given date
      const isLaunchDay = isSameDay(launchDate, currentDate);
      const isLandingDay = isSameDay(landingDate, currentDate);
      const isDockingDay = isSameDay(dockingDate, currentDate);
      const isUndockingDay = isSameDay(undockingDate, currentDate);

      // Also include if flight is in transit (between launch and docking)
      const isInTransit = launchDate <= currentDate && (!dockingDate || currentDate <= dockingDate);

      // Also include if flight is between docked and undocked
      const isDocked =
        dockingDate &&
        dockingDate <= currentDate &&
        (!undockingDate || currentDate <= undockingDate);

      return (
        isLaunchDay || isLandingDay || isDockingDay || isUndockingDay || isInTransit || isDocked
      );
    });
  }, [date, flights]);

  if (activeFlights.length === 0) return null;

  const renderCrew = (crew: FlightCrewMember[]) => (
    <div className={styles.crewList}>
      {crew.map((member) => (
        <div key={member.name} className={styles.crewMember}>
          <img
            className={styles.flag}
            src={flagUrlByCountryName[member.nationality]}
            alt={member.nationality}
          />
          <span>
            {member.name} ({member.position})
          </span>
        </div>
      ))}
    </div>
  );

  // Determine if a flight is currently docked based on the current date
  const isFlightCurrentlyDocked = (flight: Flight, currentDate: Date) => {
    const dockingDate = flight.docking_date_utc ? new Date(flight.docking_date_utc) : null;
    const undockingDate = flight.undocking_date_utc ? new Date(flight.undocking_date_utc) : null;

    return (
      dockingDate && dockingDate <= currentDate && (!undockingDate || currentDate <= undockingDate)
    );
  };

  return (
    <div className={styles.flightsContainer}>
      <div className={styles.flightsTitle}>Flights:</div>
      {activeFlights.map((flight) => {
        const currentDate = new Date(date);
        const flightIsDocked = isFlightCurrentlyDocked(flight, currentDate);

        return (
          <div key={flight.number} className={styles.flight}>
            <div className={styles.missionHeader}>
              {flight.mission_patch_url && (
                <img
                  className={styles.missionPatch}
                  src={flight.mission_patch_url}
                  alt={`${flight.mission_name} patch`}
                />
              )}
              <div className={styles.missionInfo}>
                <h3>{flight.mission_name}</h3>
                <div>
                  <span className={styles.labelText}>Flight:</span> {flight.iss_flight}
                </div>
                <div>
                  <span className={styles.labelText}>Mission:</span> {flight.mission_name}
                </div>
                <div>
                  <span className={styles.labelText}>Spacecraft:</span> {flight.spacecraft}
                </div>
                {flight.notes && (
                  <div>
                    <span className={styles.labelText}>Notes:</span> {flight.notes}
                  </div>
                )}
              </div>
            </div>

            {flightIsDocked ? (
              <>
                <div>Currently docked to ISS</div>
                <div className={styles.timeInfo}>
                  Docked since: {new Date(flight.docking_date_utc as string).toLocaleString()}
                  {flight.undocking_date_utc &&
                    ` • Scheduled undocking: ${new Date(flight.undocking_date_utc).toLocaleString()}`}
                </div>
              </>
            ) : new Date(flight.launch_date_utc) > new Date(date) ? (
              <>
                <div>Launching Crew:</div>
                {renderCrew(flight.crew_launching)}
                <div className={styles.timeInfo}>
                  Launch: {new Date(flight.launch_date_utc).toLocaleString()}
                  {flight.docking_date_utc &&
                    ` • Docking: ${new Date(flight.docking_date_utc).toLocaleString()}`}
                </div>
              </>
            ) : (
              <>
                <div>Landing Crew:</div>
                {renderCrew(flight.crew_landing)}
                <div className={styles.timeInfo}>
                  {flight.undocking_date_utc &&
                    `Undocking: ${new Date(flight.undocking_date_utc).toLocaleString()} • `}
                  Landing: {new Date(flight.landing_date_utc).toLocaleString()}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Flights;

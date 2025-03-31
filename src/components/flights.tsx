import { useMemo } from "react";
import styles from "./flights.module.css";
import { flagUrlByCountryName } from "utils/countries";

const isSameDay = (date1: Date | null, date2: Date): boolean => {
  if (!date1) return false;
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
};

// Check if any docking event is active on the given date
const hasActiveDockingEvent = (
  dockingEvents: FlightDockingEvent[] | undefined,
  currentDate: Date
): boolean => {
  if (!dockingEvents || dockingEvents.length === 0) return false;

  return dockingEvents.some((event) => {
    const dockingDate = event.docking_date ? new Date(event.docking_date) : null;
    const undockingDate = event.undocking_date ? new Date(event.undocking_date) : null;

    return (
      dockingDate && dockingDate <= currentDate && (!undockingDate || currentDate <= undockingDate)
    );
  });
};

// Get the current active docking event if any
const getActiveDockingEvent = (
  dockingEvents: FlightDockingEvent[] | undefined,
  currentDate: Date
): FlightDockingEvent | null => {
  if (!dockingEvents || dockingEvents.length === 0) return null;

  return (
    dockingEvents.find((event) => {
      const dockingDate = event.docking_date ? new Date(event.docking_date) : null;
      const undockingDate = event.undocking_date ? new Date(event.undocking_date) : null;

      return (
        dockingDate &&
        dockingDate <= currentDate &&
        (!undockingDate || currentDate <= undockingDate)
      );
    }) || null
  );
};

// Check if the date is a docking or undocking day for any event
const isDockingOrUndockingDay = (
  dockingEvents: FlightDockingEvent[] | undefined,
  currentDate: Date
): boolean => {
  if (!dockingEvents || dockingEvents.length === 0) return false;

  return dockingEvents.some((event) => {
    const dockingDate = event.docking_date ? new Date(event.docking_date) : null;
    const undockingDate = event.undocking_date ? new Date(event.undocking_date) : null;

    return isSameDay(dockingDate, currentDate) || isSameDay(undockingDate, currentDate);
  });
};

const Flights = ({ date, flights }: { date: string; flights: Flight[] }): JSX.Element | null => {
  const activeFlights = useMemo(() => {
    const currentDate = new Date(date);

    return flights.filter((flight) => {
      const launchDate = new Date(flight.launch_date_utc);
      const landingDate = flight.landing_date_utc ? new Date(flight.landing_date_utc) : null;

      // Check if flight is active on the given date
      const isLaunchDay = isSameDay(launchDate, currentDate);
      const isLandingDay = isSameDay(landingDate, currentDate);

      // Check if any docking event is active or happens on this day
      const hasDockingEvent = isDockingOrUndockingDay(flight.docking_events, currentDate);
      const isDockedNow = hasActiveDockingEvent(flight.docking_events, currentDate);

      // Also include if flight is in transit (between launch and first docking or between undocking and landing)
      const firstDockingDate = flight.docking_events?.[0]?.docking_date
        ? new Date(flight.docking_events[0].docking_date)
        : null;

      const isInTransit =
        launchDate <= currentDate && (!firstDockingDate || currentDate <= firstDockingDate);

      return isLaunchDay || isLandingDay || hasDockingEvent || isDockedNow || isInTransit;
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
    return hasActiveDockingEvent(flight.docking_events, currentDate);
  };

  // Get active docking event information
  const getActiveDockingInfo = (flight: Flight, currentDate: Date) => {
    return getActiveDockingEvent(flight.docking_events, currentDate);
  };

  return (
    <div className={styles.flightsContainer}>
      {activeFlights.map((flight) => {
        const currentDate = new Date(date);
        const flightIsDocked = isFlightCurrentlyDocked(flight, currentDate);
        const activeDockingEvent = getActiveDockingInfo(flight, currentDate);

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
                {flight.spacecraft && (
                  <div>
                    <span className={styles.labelText}>Spacecraft:</span> {flight.spacecraft}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.flightImage}>
              {flight.infobox_image_url && (
                <img
                  className={styles.flightImage}
                  src={flight.infobox_image_url}
                  alt={`${flight.mission_name} flight`}
                />
              )}
            </div>

            {flight.notes && (
              <div>
                <span className={styles.labelText}>Notes:</span>
                {flight.notes}
              </div>
            )}

            {flightIsDocked && activeDockingEvent ? (
              <>
                <div>
                  <b>Currently docked to {activeDockingEvent.target}</b>
                </div>
                <div>
                  <span className={styles.labelText}>Port:</span> {activeDockingEvent.port}
                </div>
                <div className={styles.timeInfo}>
                  {activeDockingEvent.type === "relocation" ? "Relocated" : "Docked"} since:{" "}
                  {new Date(activeDockingEvent.docking_date).toLocaleString()}
                  {activeDockingEvent.undocking_date &&
                    ` • Scheduled undocking: ${new Date(activeDockingEvent.undocking_date).toLocaleString()}`}
                </div>
              </>
            ) : new Date(flight.launch_date_utc) > new Date(date) ? (
              <>
                <div>
                  <b>Launching Crew:</b>
                </div>
                {renderCrew(flight.crew_launching)}
                <div className={styles.timeInfo}>
                  Launch: {new Date(flight.launch_date_utc).toLocaleString()}
                  {flight.docking_events?.[0]?.docking_date &&
                    ` • First Docking: ${new Date(flight.docking_events[0].docking_date).toLocaleString()}`}
                </div>
              </>
            ) : (
              <>
                <div>
                  <b>Landing Crew:</b>
                </div>
                {renderCrew(flight.crew_landing)}
                <div className={styles.timeInfo}>
                  {flight.docking_events &&
                    flight.docking_events.length > 0 &&
                    flight.docking_events[flight.docking_events.length - 1].undocking_date &&
                    `Final Undocking: ${new Date(flight.docking_events[flight.docking_events.length - 1].undocking_date).toLocaleString()} • `}
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

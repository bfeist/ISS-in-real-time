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

// Helper function to capitalize the first letter of each word
const capitalizeWords = (str: string): string => {
  return str
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const CrewedFlights = ({
  date,
  activeFlights,
}: {
  date: string;
  activeFlights: Flight[];
}): JSX.Element | null => {
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
    <>
      <h3 className={styles.sectionHeader}>Active Crewed Missions</h3>
      {activeFlights.map((flight) => {
        const currentDate = new Date(date);
        const flightIsDocked = isFlightCurrentlyDocked(flight, currentDate);
        const activeDockingEvent = getActiveDockingInfo(flight, currentDate);

        let flightImgUrl = null;
        if (flight.infobox_image_url && !flight.infobox_image_url.includes("icon_edit")) {
          flightImgUrl = flight.infobox_image_url;
        } else {
          flightImgUrl = flight.crew_photo_url || flight.mission_patch_url;
        }

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

            <div className={styles.flightImageContainer}>
              {flightImgUrl && (
                <img
                  className={styles.flightImage}
                  src={flightImgUrl}
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
            ) : new Date(flight.launch_date) > new Date(date) ? (
              <>
                <div>
                  <b>Launching Crew:</b>
                </div>
                {renderCrew(flight.crew_launching)}
                <div className={styles.timeInfo}>
                  Launch: {new Date(flight.launch_date).toLocaleString()}
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
                  Landing: {new Date(flight.landing_date).toLocaleString()}
                </div>
              </>
            )}

            {flight.spacecraft_details && Object.keys(flight.spacecraft_details).length > 0 && (
              <div className={styles.spacecraftDetails}>
                <span className={styles.labelText}>Spacecraft Details:</span>
                <ul>
                  {Object.entries(flight.spacecraft_details).map(([key, value]) => (
                    <li key={key}>
                      <strong>{capitalizeWords(key)}:</strong> {value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <hr />
          </div>
        );
      })}
    </>
  );
};

const SupplyFlights = ({
  date,
  activeSupplyFlights,
}: {
  date: string;
  activeSupplyFlights: FlightSupply[];
}): JSX.Element | null => {
  if (activeSupplyFlights.length === 0) return null;

  return (
    <>
      <h3 className={styles.sectionHeader}>Active Supply Missions</h3>
      <div>
        {activeSupplyFlights.map((supply) => {
          const currentDate = new Date(date);
          const launchDate = new Date(supply.launch_date);
          const dockingDate = supply.docking_date ? new Date(supply.docking_date) : null;
          const undockingDate = supply.undocking_date ? new Date(supply.undocking_date) : null;

          // Determine the flight status for this date
          let status = "";
          if (isSameDay(launchDate, currentDate)) {
            status = "Launching Today";
          } else if (dockingDate && isSameDay(dockingDate, currentDate)) {
            status = "Docking Today";
          } else if (undockingDate && isSameDay(undockingDate, currentDate)) {
            status = "Undocking Today";
          }

          return (
            <div key={supply.number} className={styles.flight}>
              <div className={styles.missionHeader}>
                {/* Supply flights don't have mission_patch_url, so we can't use it here */}
                <div className={styles.missionInfo}>
                  <h3>{supply.mission}</h3>
                  <div>
                    <span className={styles.labelText}>Flight:</span> {supply.flight_no}
                  </div>
                  {supply.spacecraft && (
                    <div>
                      <span className={styles.labelText}>Spacecraft:</span> {supply.spacecraft}
                    </div>
                  )}
                  {supply.is_module && <span className={styles.moduleTag}>Module Delivery</span>}
                  {supply.is_failure && <span className={styles.failureTag}>Mission Failed</span>}
                  {status && <span className={styles.statusTag}>{status}</span>}
                </div>
              </div>

              {supply.infobox_image_url && !supply.infobox_image_url.includes("icon_edit") && (
                <div className={styles.flightImageContainer}>
                  <img
                    className={styles.flightImage}
                    src={supply.infobox_image_url}
                    alt={`${supply.mission} mission`}
                  />
                </div>
              )}

              <div>
                <div className={styles.timeInfo}>
                  <div>Launch: {new Date(supply.launch_date).toLocaleString()}</div>
                  {dockingDate && (
                    <div>
                      Docking: {dockingDate.toLocaleString()} ({supply.docking_port})
                    </div>
                  )}
                  {undockingDate && <div>Undocking: {undockingDate.toLocaleString()}</div>}
                  {supply.duration && (
                    <div>
                      <span className={styles.labelText}>Duration:</span> {supply.duration}
                    </div>
                  )}
                </div>

                {supply.spacecraft_details && Object.keys(supply.spacecraft_details).length > 0 && (
                  <div className={styles.spacecraftDetails}>
                    <span className={styles.labelText}>Spacecraft Details:</span>
                    <ul>
                      {Object.entries(supply.spacecraft_details).map(([key, value]) => (
                        <li key={key}>
                          <strong>{capitalizeWords(key)}:</strong> {value}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {supply.countries && supply.countries.length > 0 && (
                  <div>
                    <span className={styles.labelText}>
                      {supply.countries.length === 1 ? "Country:" : "Countries:"}
                    </span>{" "}
                    {supply.countries.join(", ")}
                  </div>
                )}
              </div>
              <hr />
            </div>
          );
        })}
      </div>
    </>
  );
};

const Flights = ({
  date,
  flights,
  flightsSupply,
}: {
  date: string;
  flights: Flight[];
  flightsSupply: FlightSupply[];
}): JSX.Element | null => {
  // Filter crewed flights once
  const activeFlights = useMemo(() => {
    const currentDate = new Date(date);

    return flights.filter((flight) => {
      const launchDate = new Date(flight.launch_date);
      const landingDate = flight.landing_date ? new Date(flight.landing_date) : null;
      const firstDockingDate = flight.docking_events?.[0]?.docking_date
        ? new Date(flight.docking_events[0].docking_date)
        : null;

      // Check if flight is active on the current date (any of these conditions make it active)
      return (
        isSameDay(launchDate, currentDate) ||
        isSameDay(landingDate, currentDate) ||
        isDockingOrUndockingDay(flight.docking_events, currentDate) ||
        hasActiveDockingEvent(flight.docking_events, currentDate) ||
        (launchDate <= currentDate && (!firstDockingDate || currentDate <= firstDockingDate))
      );
    });
  }, [date, flights]);

  // Filter supply flights once
  const activeSupplyFlights = useMemo(() => {
    const currentDate = new Date(date);

    return flightsSupply.filter((supply) => {
      if (supply.is_module || supply.is_failure) return false;

      const launchDate = new Date(supply.launch_date);
      const undockingDate = supply.undocking_date ? new Date(supply.undocking_date) : null;

      return launchDate <= currentDate && (!undockingDate || currentDate <= undockingDate);
    });
  }, [date, flightsSupply]);

  // If nothing to display, return null
  if (activeFlights.length === 0 && activeSupplyFlights.length === 0) return null;

  return (
    <div className={styles.flightsContainer}>
      <CrewedFlights date={date} activeFlights={activeFlights} />
      <SupplyFlights date={date} activeSupplyFlights={activeSupplyFlights} />
    </div>
  );
};

export default Flights;

import { FunctionComponent, JSX, useMemo } from "react";
import styles from "./flights.module.css";
import { flagUrlByCountryName } from "utils/countries";
import {
  getActiveFlightsByDate,
  getActiveSupplyFlightsByDate,
  isFlightCurrentlyDocked,
} from "utils/onboard";
import { capitalizeWords } from "utils/string";
import { useStateClock } from "store/hooks/useStateClock";
import { useGeneralFlights, useGeneralFlightsSupply } from "api/useGeneralData";

// Keep only the functions that aren't moved to onboard.ts
const isSameDay = (date1: Date | null, date2: Date): boolean => {
  if (!date1) return false;
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
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

const CrewedFlights: FunctionComponent = (): JSX.Element | null => {
  const { selectedDate } = useStateClock();
  const { data: flights = [], isLoading } = useGeneralFlights();

  const activeFlights = useMemo(() => {
    return getActiveFlightsByDate({ dateStr: selectedDate || "", flights });
  }, [selectedDate, flights]);

  if (activeFlights.length === 0) return null;

  if (isLoading) {
    return <div>Loading flights...</div>;
  }

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

  return (
    <>
      <h3 className={styles.sectionHeader}>Active Crew Transport Vehicles</h3>
      {activeFlights.map((flight) => {
        const currentDate = new Date(selectedDate);
        const flightIsDocked = isFlightCurrentlyDocked(flight, currentDate);
        const activeDockingEvent = getActiveDockingEvent(flight.docking_events, currentDate);

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
                <h3>
                  <a
                    href={`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(flight.mission_name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {flight.mission_name}
                  </a>
                </h3>
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
            ) : new Date(flight.launch_date) > new Date(selectedDate) ? (
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

const SupplyFlights: FunctionComponent = () => {
  const { selectedDate } = useStateClock();
  const { data: flightsSupply = [], isLoading } = useGeneralFlightsSupply();

  const activeSupplyFlights = useMemo(() => {
    return getActiveSupplyFlightsByDate({ dateStr: selectedDate || "", flightsSupply });
  }, [selectedDate, flightsSupply]);

  if (isLoading) {
    return <div>Loading supply flights...</div>;
  }

  if (activeSupplyFlights.length === 0) return null;

  return (
    <>
      <h3 className={styles.sectionHeader}>Active Supply Vehicles</h3>
      <div>
        {activeSupplyFlights.map((supply) => {
          const currentDate = new Date(selectedDate);
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
            <div key={supply.number} className={styles.supplyFlight}>
              <div className={styles.missionHeader}>
                <div className={styles.missionInfo}>
                  <h3>
                    <a
                      href={`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(supply.spacecraft_name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {supply.spacecraft_name}
                    </a>
                  </h3>
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

const Flights: FunctionComponent = () => {
  const content = (
    <>
      <CrewedFlights />
      <SupplyFlights />
    </>
  );

  return (
    <div className={styles.flightsContainer}>
      <div className={styles.scrollableContent}>{content}</div>
    </div>
  );
};

export default Flights;

import { isSameDay } from "./dateTime";

/**
 * Determines the crew members onboard the ISS at a specified date and time.
 *
 * IMPORTANT: This function does NOT need to perform any name matching or normalization.
 * Each CrewArrDepItem represents a complete, matched arrival-to-departure stay.
 * The Python script (6_web_crew_arrive_dep_from_flights.py) already handled all
 * fuzzy name matching when it created these records.
 *
 * @param dateStr - The query date in 'YYYY-MM-DD' format.
 * @param appSeconds - The time of day in seconds since midnight (0-86399). Optional.
 *                     If not provided, assumes arrival at midnight and departure at 23:59:59.
 * @param crewArrDep - Array of crew arrival/departure items.
 * @returns An array of crew members onboard at the given date and time.
 */
export const getCrewMembersOnboardByDate = ({
  dateStr,
  appSeconds,
  crewArrDep,
}: {
  dateStr: string;
  appSeconds?: number;
  crewArrDep: CrewArrDepItem[];
}): CrewArrDepItem[] => {
  // check that date is in 'YYYY-MM-DD' format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    throw new Error("Invalid date format. Please use 'YYYY-MM-DD'.");
  }

  // If appSeconds is provided, create a precise timestamp
  // Otherwise, compare against the full day (00:00:00 to 23:59:59)
  if (appSeconds !== undefined) {
    const hours = Math.floor(appSeconds / 3600);
    const minutes = Math.floor((appSeconds % 3600) / 60);
    const seconds = Math.floor(appSeconds % 60);
    const timeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    const queryDateTime = new Date(`${dateStr}T${timeStr}Z`);

    const crewOnboard = crewArrDep.filter(
      (crewMember) =>
        new Date(crewMember.arrivalDate) <= queryDateTime &&
        new Date(crewMember.departureDate) >= queryDateTime
    );

    crewOnboard.sort((a, b) => a.nationality.localeCompare(b.nationality));
    return crewOnboard;
  } else {
    // When appSeconds is not provided, assume arrival at midnight and departure at end of day
    const startOfDay = new Date(`${dateStr}T00:00:00Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59Z`);

    const crewOnboard = crewArrDep.filter((crewMember) => {
      const arrivalDate = new Date(crewMember.arrivalDate);
      const departureDate = new Date(crewMember.departureDate);

      // Check if arrival date is on or before the end of the query day
      // AND departure date is on or after the start of the query day
      return arrivalDate <= endOfDay && departureDate >= startOfDay;
    });

    crewOnboard.sort((a, b) => a.nationality.localeCompare(b.nationality));
    return crewOnboard;
  }
};

/**
 * Checks if any docking event is active on the given date
 *
 * @param dockingEvents - Array of docking events to check
 * @param currentDate - The date to check against
 * @returns boolean indicating if there's an active docking event
 */
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

/**
 * Checks if the date is a docking or undocking day for any event
 *
 * @param dockingEvents - Array of docking events to check
 * @param currentDate - The date to check against
 * @returns boolean indicating if the date is a docking or undocking day
 */
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

// Determine if a flight is currently docked based on the current date
export const isFlightCurrentlyDocked = (flight: Flight, currentDate: Date): boolean => {
  const dockingEvents = flight.docking_events;
  if (!dockingEvents || dockingEvents.length === 0) return false;

  return dockingEvents.some((event) => {
    const dockingDate = event.docking_date ? new Date(event.docking_date) : null;
    const undockingDate = event.undocking_date ? new Date(event.undocking_date) : null;

    return (
      dockingDate && dockingDate <= currentDate && (!undockingDate || currentDate <= undockingDate)
    );
  });
};

/**
 * Determines the flights that are active on a specified date.
 *
 * @param dateStr - The query date in 'YYYY-MM-DD' format.
 * @param flights - Array of flights to filter.
 * @returns An array of flights that are active on the given date.
 */
export const getActiveFlightsByDate = ({
  dateStr,
  flights,
}: {
  dateStr: string;
  flights: Flight[];
}): Flight[] => {
  // Check that date is in 'YYYY-MM-DD' format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    throw new Error("Invalid date format. Please use 'YYYY-MM-DD'.");
  }
  const currentDate = new Date(dateStr);

  // Filter flights that are active on the current date
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
};

/**
 * Determines supply flights that are active on a specified date.
 *
 * @param dateStr - The query date in 'YYYY-MM-DD' format.
 * @param flightsSupply - Array of supply flights to filter.
 * @returns An array of supply flights that are active on the given date.
 */
export const getActiveSupplyFlightsByDate = ({
  dateStr,
  flightsSupply,
}: {
  dateStr: string;
  flightsSupply: FlightSupply[];
}): FlightSupply[] => {
  // Check that date is in 'YYYY-MM-DD' format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    throw new Error("Invalid date format. Please use 'YYYY-MM-DD'.");
  }
  const currentDate = new Date(dateStr);

  // Filter supply flights that are active on the current date
  return flightsSupply.filter((supply) => {
    if (supply.is_module || supply.is_failure) return false;

    const launchDate = new Date(supply.launch_date);
    const undockingDate = supply.undocking_date ? new Date(supply.undocking_date) : null;

    return launchDate <= currentDate && (!undockingDate || currentDate <= undockingDate);
  });
};

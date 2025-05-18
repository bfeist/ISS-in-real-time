import { isSameDay } from "./dates";

/**
 * Determines the crew members onboard the ISS on a specified date.
 *
 * @param dateStr - The query date in 'YYYY-MM-DD' format.
 * @param crewArrDep - Array of crew arrival/departure items.
 * @returns A promise that resolves to an array of crew members onboard on the given date.
 */
export const getCrewMembersOnboardByDate = ({
  dateStr,
  crewArrDep,
}: {
  dateStr: string;
  crewArrDep: CrewArrDepItem[];
}): CrewArrDepItem[] => {
  // check that date is in 'YYYY-MM-DD' format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    throw new Error("Invalid date format. Please use 'YYYY-MM-DD'.");
  }
  const queryDate = new Date(dateStr);

  // filter crewArrDep for crew members onboard on the query date
  const crewOnboard = crewArrDep.filter(
    (crewMember) =>
      new Date(crewMember.arrivalDate) <= queryDate &&
      new Date(crewMember.departureDate) >= queryDate
  );

  // sort crew members by nationality
  crewOnboard.sort((a, b) => a.nationality.localeCompare(b.nationality));

  return crewOnboard;
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

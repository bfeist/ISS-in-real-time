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

  return crewOnboard;
};

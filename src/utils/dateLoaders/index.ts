export { getDatePageData } from "./dateSlug";

export async function getDataAvailabilities(): Promise<GetDataIndexPageDataResponse> {
  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL.replace("\\x3a", ":");
  let dataAvailabilityItems: DataAvailability[] = [];
  let evaDetails: EvaDetail[] = [];
  let crewArrDep: CrewArrDepItem[] = [];
  let expeditionInfo: ExpeditionInfo[] = [];
  let flights: Flight[] = [];
  let flightsSupply: FlightSupply[] = [];

  const fetchPromises = [];
  // fetch data_availability.csv
  fetchPromises.push(
    fetch(`${baseStaticUrl}/data_availability.csv`)
      .then((response): Promise<string> => (response.ok ? response.text() : Promise.resolve("")))
      .then((dataAvailabilitiesRaw: string): void => {
        dataAvailabilityItems = processDataAvailabilities({
          dataAvailabilitiesRaw,
        });
      })
      .catch(() => {
        console.error("Failed to fetch data availability");
      })
  );

  // Always fetch common data
  fetchPromises.push(
    fetch(`${baseStaticUrl}/eva_details.json`)
      .then(
        (response): Promise<EvaDetail[]> => (response.ok ? response.json() : Promise.resolve([]))
      )
      .then((data: EvaDetail[]): void => {
        evaDetails = data;
      })
      .catch(() => {
        console.error("Failed to fetch EVA details");
      })
  );

  fetchPromises.push(
    fetch(`${baseStaticUrl}/crew_arr_dep.json`)
      .then(
        (response): Promise<CrewArrDepItem[]> =>
          response.ok ? response.json() : Promise.resolve([])
      )
      .then((data: CrewArrDepItem[]): void => {
        crewArrDep = data;
      })
      .catch(() => {
        console.error("Failed to fetch Crew Arrival/Departure data");
      })
  );

  fetchPromises.push(
    fetch(`${baseStaticUrl}/expeditions.json`)
      .then(
        (response): Promise<ExpeditionInfo[]> =>
          response.ok ? response.json() : Promise.resolve([])
      )
      .then((data: ExpeditionInfo[]): void => {
        expeditionInfo = data;
      })
      .catch(() => {
        console.error("Failed to fetch Expedition data");
      })
  );

  fetchPromises.push(
    fetch(`${baseStaticUrl}/flights.json`)
      .then((response): Promise<Flight[]> => (response.ok ? response.json() : Promise.resolve([])))
      .then((data: Flight[]): void => {
        flights = data;
      })
      .catch(() => {
        console.error("Failed to fetch Flight data");
      })
  );

  fetchPromises.push(
    fetch(`${baseStaticUrl}/flights_supply.json`)
      .then(
        (response): Promise<FlightSupply[]> => (response.ok ? response.json() : Promise.resolve([]))
      )
      .then((data: FlightSupply[]): void => {
        flightsSupply = data;
      })
      .catch(() => {
        console.error("Failed to fetch Flight Supply data");
      })
  );

  await Promise.all(fetchPromises);
  return {
    dataAvailabilityItems,
    evaDetails,
    crewArrDep,
    expeditionInfo,
    flights,
    flightsSupply,
  };
}

export function processDataAvailabilities({
  dataAvailabilitiesRaw,
}: {
  dataAvailabilitiesRaw: string;
}): DataAvailability[] {
  const lines = dataAvailabilitiesRaw
    .split("\n")
    .map((line) => line.replace(/\r/g, ""))
    .filter((line) => line.trim() !== ""); // Skip blank lines
  // Skip header row
  const dataLines = lines.slice(1);
  const dataAvailabilities = dataLines.map((line) => {
    const [date, comm, vvComm, youtube, eva, blog, activitySummary, earthPhotography] =
      line.split("|");
    return {
      date,
      comm: comm === "1",
      vvComm: vvComm === "1",
      youtube: youtube === "1",
      eva: eva === "1",
      blog: blog === "1",
      activitySummary: activitySummary === "1",
      earthPhotography: earthPhotography === "1",
    };
  });
  return dataAvailabilities;
}

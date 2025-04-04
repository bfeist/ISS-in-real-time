export { getDatePageData } from "./dateSlug";

export async function getDataAvailabilities(): Promise<DataAvailability[]> {
  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL;
  const dataAvailabilityUrl = `${baseStaticUrl}/data_availability.csv`;

  try {
    const dataAvailabilityResult = await fetch(dataAvailabilityUrl);
    const dataAvailabilitiesRaw = await dataAvailabilityResult.text();
    const dataAvailabilities = processDataAvailabilities({
      dataAvailabilitiesRaw,
    });
    return dataAvailabilities;
  } catch (error) {
    return [];
  }
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

import { getBaseStaticUrl } from "../utils/api";
import { processCommCsv } from "../utils/comm";

// Individual fetch functions for each data type
export async function fetchDataAvailabilities(): Promise<DataAvailability[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const response = await fetch(`${baseStaticUrl}/data_availability.csv`);

  if (!response.ok) {
    throw new Error("Failed to fetch data availability");
  }

  const dataAvailabilitiesRaw = await response.text();
  return processDataAvailabilities({ dataAvailabilitiesRaw });
}

export async function fetchEvaDetails(): Promise<EvaDetail[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const response = await fetch(`${baseStaticUrl}/eva_details.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch EVA details");
  }

  return response.json();
}

export async function fetchCrewArrDep(): Promise<CrewArrDepItem[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const response = await fetch(`${baseStaticUrl}/crew_arr_dep.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch Crew Arrival/Departure data");
  }

  return response.json();
}

export async function fetchExpeditionInfo(): Promise<ExpeditionInfo[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const response = await fetch(`${baseStaticUrl}/expeditions.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch Expedition data");
  }

  return response.json();
}

export async function fetchFlights(): Promise<Flight[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const response = await fetch(`${baseStaticUrl}/flights.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch Flight data");
  }

  return response.json();
}

export async function fetchFlightsSupply(): Promise<FlightSupply[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const response = await fetch(`${baseStaticUrl}/flights_supply.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch Flight Supply data");
  }

  return response.json();
}

export async function fetchCommFirstData(): Promise<Record<string, CommFirstItem>> {
  const baseStaticUrl = getBaseStaticUrl();

  const response = await fetch(`${baseStaticUrl}/comm_first.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch COMM first items");
  }

  return response.json();
}

export async function fetchOrbitsDaily(): Promise<OrbitDaily> {
  const baseStaticUrl = getBaseStaticUrl();

  const response = await fetch(`${baseStaticUrl}/orbits_daily.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch orbits daily data");
  }

  return response.json();
}

// Date-specific fetch functions
export async function fetchCommTranscript(date: string): Promise<CommItem[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const [year, month, day] = date.split("-");

  const response = await fetch(
    `${baseStaticUrl}/comm/${year}/${month}/${day}/_transcript_${date}.csv`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch COMM transcript");
  }

  const text = await response.text();
  return text ? processCommCsv(text) : [];
}

export async function fetchEphemera(date: string): Promise<EphemeraItem[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const [year, month] = date.split("-");

  const response = await fetch(`${baseStaticUrl}/ephemera/${year}/${year}-${month}.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch Ephemera data");
  }

  return response.json();
}

export async function fetchEarthPhotography(date: string): Promise<PhotoItem[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const [year, month] = date.split("-");

  const response = await fetch(
    `${baseStaticUrl}/photos_earth/${year}/${month}/images-manifest_${date}.json`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Earth Photography data");
  }

  const data = await response.json();
  if (data.length > 0) {
    data.sort((a: PhotoItem, b: PhotoItem) => a.dateTaken.localeCompare(b.dateTaken));
  }
  return data.map((item: PhotoItem) => ({ ...item, type: "photos_earth" }));
}

export async function fetchImagesNasaGov(): Promise<PhotoItem[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const response = await fetch(`${baseStaticUrl}/images_nasa_gov.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch NASA Images data");
  }

  const data = await response.json();
  return data.map((item: PhotoItem) => ({ ...item, type: "images_nasa_gov" }));
}

export async function fetchPhotosManual(): Promise<PhotoItem[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const response = await fetch(`${baseStaticUrl}/photos_manual.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch Photos Manual data");
  }

  const data = await response.json();
  return data.map((item: PhotoItem) => ({ ...item, type: "manual" }));
}

export async function fetchVideoYt(): Promise<VideoYtItem[]> {
  const baseStaticUrl = getBaseStaticUrl();

  const response = await fetch(`${baseStaticUrl}/videoYt.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch YouTube Live Recordings");
  }

  return response.json();
}

export async function fetchVideoIa(): Promise<VideoIaItem[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const response = await fetch(`${baseStaticUrl}/videoIa.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch IA Videos");
  }

  return response.json();
}

export async function fetchActivitySummary(date: string): Promise<ActivitySummary> {
  const baseStaticUrl = getBaseStaticUrl();
  const [year, month] = date.split("-");

  const response = await fetch(
    `${baseStaticUrl}/activity_summaries/${year}/${month}/activity_summary_${date}.json`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Activity Summary data");
  }

  return response.json();
}

export async function fetchBlogArticles(date: string): Promise<BlogArticle[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const [year, month, day] = date.split("-");

  const response = await fetch(
    `${baseStaticUrl}/blog_articles/${year}/${month}/${day}/articles.json`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Blog Articles data");
  }

  return response.json();
}

export async function fetchStats(): Promise<Stats> {
  const baseStaticUrl = getBaseStaticUrl();
  const response = await fetch(`${baseStaticUrl}/stats.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch Stats");
  }

  return response.json();
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
    const [date, comm, vvComm, video, eva, blog, actSum, earthPhotos, photos] = line.split("|");
    return {
      date,
      comm: comm === "1",
      vvComm: vvComm === "1",
      video: video === "1",
      eva: eva === "1",
      blog: blog === "1",
      actSum: actSum === "1",
      earthPhotos: earthPhotos === "1",
      photos: photos === "1",
    };
  });
  return dataAvailabilities;
}

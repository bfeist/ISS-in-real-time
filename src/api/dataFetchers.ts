import { getBaseStaticUrl } from "../utils/api";
import { processCommCsv } from "../utils/comm";
import { generateEarthPhotoUrls, markTimelapsePhotos } from "../utils/photosEarth";

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

export async function fetchLiveTle(date: string): Promise<EphemeraItem | null> {
  try {
    const response = await fetch("https://celestrak.org/NORAD/elements/gp.php?CATNR=25544");
    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const lines = text.trim().split("\n");
    if (lines.length < 3) {
      return null;
    }

    const tle_line1 = lines[1].trim();
    const tle_line2 = lines[2].trim();
    const epoch = `${date}T00:00:00Z`;
    return { epoch, tle_line1, tle_line2 };
  } catch (error) {
    return null;
  }
}

interface EarthPhotoRaw {
  ID: string;
  dateTaken: string;
  // Geographic coordinates (optional)
  lat?: number;
  lon?: number;
  corners?: {
    ul: { lat: number; lon: number };
    ur: { lat: number; lon: number };
    ll: { lat: number; lon: number };
    lr: { lat: number; lon: number };
  };
  // Feature descriptions (optional)
  mlFeat?: string;
  feat?: string;
  caption?: string;
  publicFeatures?: string;
  // Camera metadata (optional)
  focalLength?: number;
  camera?: string;
}

export async function fetchEarthPhotography(date: string): Promise<PhotoItemEarth[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const [year, month] = date.split("-");

  const response = await fetch(
    `${baseStaticUrl}/photos_earth/${year}/${month}/images-manifest_${date}.json`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Earth Photography data");
  }

  const data: EarthPhotoRaw[] = await response.json();
  if (data.length > 0) {
    data.sort((a: EarthPhotoRaw, b: EarthPhotoRaw) => a.dateTaken.localeCompare(b.dateTaken));
  }

  const photos = data.map((item: EarthPhotoRaw) => {
    // Convert ID to nasaId and generate URLs
    const { ID, ...itemWithoutId } = item;
    const urls = generateEarthPhotoUrls(ID);
    return {
      ...itemWithoutId, // This spreads all optional properties (lat, lon, corners, mlFeat, feat, caption, publicFeatures, focalLength, camera)
      ...urls,
      nasaId: ID,
      type: "photos_earth" as const,
    };
  });

  // Apply timelapse detection to the photos
  return markTimelapsePhotos(photos);
}

interface FlickrPhotoRaw {
  nasaId: string;
  dateTaken: string;
  smallUrl: string;
  medUrl: string;
  largeUrl: string;
  description: string;
  sourceUrl: string;
}

export async function fetchPhotosFlickr(date: string): Promise<PhotoItemFlickr[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const [year, month] = date.split("-");

  const response = await fetch(
    `${baseStaticUrl}/photos_flickr/${year}/${month}/photos-manifest_${date}.json`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Flickr Photos data");
  }

  const data: FlickrPhotoRaw[] = await response.json();

  // Process photos with 00:00:00 timestamps
  const photosWithMidnight = data.filter((item) => item.dateTaken.includes("00:00:00"));
  const photosWithoutMidnight = data.filter((item) => !item.dateTaken.includes("00:00:00"));

  // Sort midnight photos by nasaId and assign new times 15 seconds apart
  if (photosWithMidnight.length > 0) {
    photosWithMidnight.sort((a, b) => (a.nasaId || "").localeCompare(b.nasaId || ""));
    photosWithMidnight.forEach((item, index) => {
      const seconds = index * 15;
      const hours = Math.floor(seconds / 3600)
        .toString()
        .padStart(2, "0");
      const minutes = Math.floor((seconds % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const secs = (seconds % 60).toString().padStart(2, "0");
      const newTime = `${hours}:${minutes}:${secs}`;
      item.dateTaken = item.dateTaken.replace("00:00:00", newTime);
    });
  }

  // Combine and sort all photos by dateTaken
  const allPhotos = [...photosWithoutMidnight, ...photosWithMidnight];
  if (allPhotos.length > 0) {
    allPhotos.sort((a: FlickrPhotoRaw, b: FlickrPhotoRaw) =>
      a.dateTaken.localeCompare(b.dateTaken)
    );
  }

  return allPhotos.map((item: FlickrPhotoRaw) => ({
    ID: item.nasaId || "unknown",
    dateTaken: item.dateTaken,
    smallUrl: item.smallUrl,
    medUrl: item.medUrl,
    largeUrl: item.largeUrl,
    nasaId: item.nasaId,
    description: item.description,
    sourceUrl: item.sourceUrl,
    type: "photos_flickr" as const,
  }));
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

  const data = await response.json();

  // Convert source_url to sourceUrl for camelCase consistency
  if (data.source_url) {
    data.sourceUrl = data.source_url;
    delete data.source_url;
  }

  return data;
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

export async function fetchNotableMoments(): Promise<NotableMomentItem[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const response = await fetch(`${baseStaticUrl}/notable_moments.csv`);

  if (!response.ok) {
    throw new Error("Failed to fetch Notable Moments");
  }

  const text = await response.text();
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\r/g, ""))
    .filter((line) => line.trim() !== "");

  return lines
    .map((line) => {
      const [datetime, description] = line.split("|");
      return {
        datetime: datetime.trim(),
        description: description.trim(),
      };
    })
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
}

export async function fetchCloudsAvailable(): Promise<Record<string, string[]>[]> {
  const baseStaticUrl = getBaseStaticUrl();
  const response = await fetch(`${baseStaticUrl}/clouds_available.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch Clouds Available data");
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
    const [date, comm, vvComm, video, eva, blog, actSum, earthPhotos, flickrPhotos, timeline] =
      line.split("|");
    return {
      date,
      comm: comm === "1",
      vvComm: vvComm === "1",
      video: video === "1",
      eva: eva === "1",
      blog: blog === "1",
      actSum: actSum === "1",
      earthPhotos: earthPhotos === "1",
      flickrPhotos: flickrPhotos === "1",
      timeline: timeline === "1",
    };
  });
  return dataAvailabilities;
}

import { LoaderFunctionArgs } from "react-router-dom";
import { processCommCsv } from "utils/comm";
import { youtubeApplyManualStartTimes } from "./youtubeVideos";

export async function getDatePageData({
  params,
}: LoaderFunctionArgs): Promise<GetDatePageDataResponse> {
  const date = params.date;
  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL;
  const [year, month, day] = date!.split("-");

  const dataAvailabilityUrl = `${baseStaticUrl}/data_availability.csv`;

  try {
    // First fetch the data availability
    const dataAvailabilityResponse = await fetch(dataAvailabilityUrl);
    if (!dataAvailabilityResponse.ok) {
      throw new Error("Failed to fetch data availability");
    }

    const dataAvailabilitiesRaw = await dataAvailabilityResponse.text();
    const dataAvailabilities = processDataAvailabilities({
      dataAvailabilitiesRaw,
    });
    const dataAvailability = dataAvailabilities.find((da) => da.date === date);

    // Default empty values for all possible data
    let commItems: CommItem[] = [];
    let earthPhotographyItems: EarthPhotographyItem[] = [];
    let ephemeraItems: EphemeraItem[] = [];
    let evaDetails: EvaDetail[] = [];
    let youtubeLiveRecordings: YoutubeLiveRecording[] = [];
    let crewArrDep: CrewArrDepItem[] = [];
    let expeditionInfo: ExpeditionInfo[] = [];
    let nationalityFlags: NationalityFlags = {};
    let flights: Flight[] = [];

    // Create fetch promises based on data availability
    const fetchPromises = [];

    // Always fetch common data
    fetchPromises.push(
      fetch(`${baseStaticUrl}/eva_details.json`)
        .then(
          (response): Promise<EvaDetail[]> => (response.ok ? response.json() : Promise.resolve([]))
        )
        .then((data: EvaDetail[]): void => {
          evaDetails = data;
        })
        .catch(() => {})
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
        .catch(() => {})
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
        .catch(() => {})
    );

    fetchPromises.push(
      fetch(`${baseStaticUrl}/nationality_flags.json`)
        .then(
          (response): Promise<NationalityFlags> =>
            response.ok ? response.json() : Promise.resolve({})
        )
        .then((data: NationalityFlags): void => {
          nationalityFlags = data;
        })
        .catch(() => {})
    );

    fetchPromises.push(
      fetch(`${baseStaticUrl}/flights.json`)
        .then(
          (response): Promise<Flight[]> => (response.ok ? response.json() : Promise.resolve([]))
        )
        .then((data: Flight[]): void => {
          flights = data;
        })
        .catch(() => {})
    );

    // Fetch transcript if available
    if (dataAvailability?.comm) {
      fetchPromises.push(
        fetch(`${baseStaticUrl}/comm/${year}/${month}/${day}/_transcript_${date}.csv`)
          .then(
            (response): Promise<string> => (response.ok ? response.text() : Promise.resolve(""))
          )
          .then((text: string): void => {
            if (text) commItems = processCommCsv(text);
          })
          .catch(() => {})
      );
    }

    // Ephemera is month-based, so we always fetch it
    fetchPromises.push(
      fetch(`${baseStaticUrl}/ephemera/${year}/${year}-${month}.json`)
        .then(
          (response): Promise<EphemeraItem[]> =>
            response.ok ? response.json() : Promise.resolve([])
        )
        .then((data: EphemeraItem[]): void => {
          ephemeraItems = data;
        })
        .catch(() => {})
    );

    // Fetch earth photography if available
    if (dataAvailability?.earthPhotography) {
      fetchPromises.push(
        fetch(`${baseStaticUrl}/earth_photography/${year}/${month}/images-manifest_${date}.json`)
          .then(
            (response): Promise<EarthPhotographyItem[]> =>
              response.ok ? response.json() : Promise.resolve([])
          )
          .then((data: EarthPhotographyItem[]): void => {
            earthPhotographyItems = data;
            if (earthPhotographyItems.length > 0) {
              earthPhotographyItems.sort((a, b) => a.dateTaken.localeCompare(b.dateTaken));
            }
          })
          .catch(() => {})
      );
    }

    // Fetch YouTube data if available
    if (dataAvailability?.youtube) {
      // For YouTube, we need both resources to process together
      const youtubeLivePromise = fetch(`${baseStaticUrl}/youtube_live_recordings.json`)
        .then(
          (response): Promise<YoutubeLiveRecording[]> =>
            response.ok ? response.json() : Promise.resolve([])
        )
        .catch((): YoutubeLiveRecording[] => []);

      const youtubeManualPromise = fetch(`${baseStaticUrl}/youtube_manual_start_times.json`)
        .then(
          (response): Promise<YoutubeManualStartTime[]> =>
            response.ok ? response.json() : Promise.resolve([])
        )
        .catch((): YoutubeManualStartTime[] => []);

      fetchPromises.push(
        Promise.all([youtubeLivePromise, youtubeManualPromise]).then(
          ([recordings, manualTimes]): void => {
            youtubeLiveRecordings = youtubeApplyManualStartTimes({
              youtubeLiveRecordings: recordings,
              youtubeManualStartTimes: manualTimes,
            });
          }
        )
      );
    }

    // Wait for all fetches to complete
    await Promise.all(fetchPromises);

    return {
      transcriptItems: commItems,
      earthPhotographyItems,
      ephemeraItems,
      evaDetails,
      dataAvailability,
      youtubeLiveRecordings,
      crewArrDep,
      expeditionInfo,
      nationalityFlags,
      flights,
    };
  } catch (error) {
    console.error(error);
    return {
      transcriptItems: [],
      earthPhotographyItems: [],
      ephemeraItems: [],
      evaDetails: [],
      dataAvailability: null,
      youtubeLiveRecordings: [],
      crewArrDep: [],
      expeditionInfo: [],
      nationalityFlags: {},
      flights: [],
    };
  }
}

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

export async function getCesiumPageData(): Promise<GetCesiumPageDataResponse> {
  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL;
  const date = "2023-11-01";
  const [year, month, _day] = date.split("-");

  const ephemeraUrl = `${baseStaticUrl}/ephemera/${year}/${year}-${month}.json`;

  try {
    const ephemeraResult = await fetch(ephemeraUrl);
    const ephemeraItems = await ephemeraResult.json();
    return ephemeraItems;
  } catch (error) {
    return {
      ephemeraItems: [],
    };
  }
}

export function processDataAvailabilities({
  dataAvailabilitiesRaw,
}: {
  dataAvailabilitiesRaw: string;
}): DataAvailability[] {
  const lines = dataAvailabilitiesRaw.split("\n").filter((line) => line.trim() !== ""); // Skip blank lines
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

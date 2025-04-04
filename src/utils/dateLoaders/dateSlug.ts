import { LoaderFunctionArgs } from "react-router-dom";
import { processCommCsv } from "utils/comm";
import { youtubeApplyManualStartTimes } from "../youtubeVideos";
import { processDataAvailabilities } from "./index";

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
    let flights: Flight[] = [];
    let activitySummary: ActivitySummary = {};
    let blogArticles: BlogArticle[] = [];

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

    if (dataAvailability?.activitySummary) {
      fetchPromises.push(
        fetch(`${baseStaticUrl}/activity_summaries/${year}/${month}/activity_summary_${date}.json`)
          .then(
            (response): Promise<ActivitySummary> =>
              response.ok ? response.json() : Promise.resolve(null)
          )
          .then((data: ActivitySummary): void => {
            activitySummary = data;
          })
          .catch(() => {})
      );
    }

    if (dataAvailability?.blog) {
      fetchPromises.push(
        fetch(`${baseStaticUrl}/blog_articles/${year}/${month}/${day}/articles.json`)
          .then(
            (response): Promise<BlogArticle[]> =>
              response.ok ? response.json() : Promise.resolve([])
          )
          .then((data: BlogArticle[]): void => {
            blogArticles = data;
          })
          .catch(() => {})
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
      flights,
      activitySummary,
      blogArticles,
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
      flights: [],
      activitySummary: {},
      blogArticles: [],
    };
  }
}

import { LoaderFunctionArgs } from "react-router-dom";
import { processTranscriptCsv } from "utils/transcript";
import { youtubeApplyManualStartTimes } from "./youtubeVideos";

export async function getDatePageData({
  params,
}: LoaderFunctionArgs): Promise<GetDatePageDataResponse> {
  const date = params.date;
  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL;
  const [year, month, day] = date!.split("-");

  const transcriptUrl = `${baseStaticUrl}/comm/${year}/${month}/${day}/_transcript_${date}.csv`;
  const imagesUrl = `${baseStaticUrl}/images/${year}/${month}/images-manifest_${date}.json`;
  const ephemeraUrl = `${baseStaticUrl}/ephemera/${year}/${year}-${month}.json`;
  const evaDetailsUrl = `${baseStaticUrl}/eva_details.json`;
  const availableDatesUrl = `${baseStaticUrl}/available_dates.json`;
  const youtubeLiveRecordingsUrl = `${baseStaticUrl}/youtube_live_recordings.json`;
  const youtubeManualStartTimesUrl = `${baseStaticUrl}/youtube_manual_start_times.json`;
  const crewArrDepUrl = `${baseStaticUrl}/iss_crew_arr_dep.json`;
  const expeditionInfoUrl = `${baseStaticUrl}/expeditions.json`;

  try {
    const results = await Promise.allSettled([
      fetch(transcriptUrl),
      fetch(imagesUrl),
      fetch(ephemeraUrl),
      fetch(evaDetailsUrl),
      fetch(availableDatesUrl),
      fetch(youtubeLiveRecordingsUrl),
      fetch(youtubeManualStartTimesUrl),
      fetch(crewArrDepUrl),
      fetch(expeditionInfoUrl),
    ]);

    const [
      transcriptResult,
      imagesResult,
      ephemeraResult,
      evaDetailsResult,
      availableDatesResult,
      youtubeLiveRecordingsResult,
      youtubeManualStartTimesResult,
      crewArrDepResult,
      expeditionInfoResult,
    ] = results;

    const transcriptItems: TranscriptItem[] =
      transcriptResult.status === "fulfilled" && transcriptResult.value.ok
        ? processTranscriptCsv(await transcriptResult.value.text())
        : [];
    const imageItems: ImageItem[] =
      imagesResult.status === "fulfilled" && imagesResult.value.ok
        ? await imagesResult.value.json()
        : [];
    imageItems.sort((a, b) => a.dateTaken.localeCompare(b.dateTaken));

    const ephemeraItems: EphemeraItem[] =
      ephemeraResult.status === "fulfilled" && ephemeraResult.value.ok
        ? await ephemeraResult.value.json()
        : [];
    const evaDetails: EvaDetail[] =
      evaDetailsResult.status === "fulfilled" && evaDetailsResult.value.ok
        ? await evaDetailsResult.value.json()
        : [];
    const availableDates: AvailableDate[] =
      availableDatesResult.status === "fulfilled" && availableDatesResult.value.ok
        ? await availableDatesResult.value.json()
        : [];
    const youtubeLiveRecordingsUncorrected: YoutubeLiveRecording[] =
      youtubeLiveRecordingsResult.status === "fulfilled" && youtubeLiveRecordingsResult.value.ok
        ? await youtubeLiveRecordingsResult.value.json()
        : [];
    const youtubeManualStartTimes: YoutubeManualStartTime[] =
      youtubeManualStartTimesResult.status === "fulfilled" && youtubeManualStartTimesResult.value.ok
        ? await youtubeManualStartTimesResult.value.json()
        : [];
    const crewArrDep: CrewArrDepItem[] =
      crewArrDepResult.status === "fulfilled" && crewArrDepResult.value.ok
        ? await crewArrDepResult.value.json()
        : [];
    const expeditionInfo: ExpeditionInfo[] =
      expeditionInfoResult.status === "fulfilled" && expeditionInfoResult.value.ok
        ? await expeditionInfoResult.value.json()
        : [];

    const youtubeLiveRecordings = youtubeApplyManualStartTimes({
      youtubeLiveRecordings: youtubeLiveRecordingsUncorrected,
      youtubeManualStartTimes,
    });

    return {
      transcriptItems,
      imageItems,
      ephemeraItems,
      evaDetails,
      availableDates,
      youtubeLiveRecordings,
      crewArrDep,
      expeditionInfo,
    };
  } catch (error) {
    return {
      transcriptItems: [],
      imageItems: [],
      ephemeraItems: [],
      evaDetails: [],
      availableDates: [],
      youtubeLiveRecordings: [],
      crewArrDep: [],
      expeditionInfo: [],
    };
  }
}

export async function getAvailableDates(): Promise<AvailableDate[]> {
  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL;
  try {
    const response = await fetch(`${baseStaticUrl}/available_dates.json`);
    if (!response.ok) {
      throw new Error("Failed to fetch available dates");
    }
    const data = await response.json();
    return data;
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

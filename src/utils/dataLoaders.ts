import { LoaderFunctionArgs } from "react-router-dom";
import { processTranscriptCsv } from "utils/transcript";
import { processYoutubeVideosCsv } from "./youtubeVideos";

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
  const youtubeLiveRecordingsUrl = `${baseStaticUrl}/youtube_live_recordings.csv`;

  try {
    const [
      transcriptResponse,
      imagesResponse,
      ephemeraResponse,
      evaDetailsResponse,
      availableDatesResponse,
      youtubeLiveRecordingsResponse,
    ] = await Promise.all([
      fetch(transcriptUrl),
      fetch(imagesUrl),
      fetch(ephemeraUrl),
      fetch(evaDetailsUrl),
      fetch(availableDatesUrl),
      fetch(youtubeLiveRecordingsUrl),
    ]);

    if (
      !transcriptResponse.ok ||
      !imagesResponse.ok ||
      !ephemeraResponse.ok ||
      !evaDetailsResponse.ok ||
      !availableDatesResponse.ok ||
      !youtubeLiveRecordingsResponse.ok
    ) {
      throw new Response("Failed to fetch data", { status: 500 });
    }

    const transcriptCsv = await transcriptResponse.text();
    const transcriptItems = processTranscriptCsv(transcriptCsv);
    const imageItems: ImageItem[] = await imagesResponse.json();
    const ephemeraItems: EphemeraItem[] = await ephemeraResponse.json();
    const evaDetails: EvaDetail[] = await evaDetailsResponse.json();
    const availableDates: string[] = await availableDatesResponse.json();
    const youtubeLiveRecordingsCsv = await youtubeLiveRecordingsResponse.text();
    const youtubeLiveRecordings = processYoutubeVideosCsv(youtubeLiveRecordingsCsv);

    return {
      transcriptItems,
      imageItems,
      ephemeraItems,
      evaDetails,
      availableDates,
      youtubeLiveRecordings,
    };
  } catch (error) {
    return {
      transcriptItems: [],
      imageItems: [],
      ephemeraItems: [],
      evaDetails: [],
      availableDates: [],
      youtubeLiveRecordings: [],
    };
  }
}

export async function getAvailableDates(): Promise<string[]> {
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

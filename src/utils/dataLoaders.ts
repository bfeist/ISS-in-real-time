import { LoaderFunctionArgs } from "react-router-dom";
import { processTranscriptCsv } from "utils/transcript";

export async function getDatePageData({
  params,
}: LoaderFunctionArgs): Promise<GetDatePageDataResponse> {
  const date = params.date;
  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL;
  const [year, month, day] = date!.split("-");

  const transcriptUrl = `${baseStaticUrl}/comm/${year}/${month}/${day}/_transcript_${date}.csv`;
  const imagesUrl = `${baseStaticUrl}/images/${year}/${month}/images-manifest_${date}.json`;
  const ephemeraUrl = `${baseStaticUrl}/ephemera/${year}/${year}-${month}.json`;

  try {
    const [transcriptResponse, imagesResponse, ephemeraResponse] = await Promise.all([
      fetch(transcriptUrl),
      fetch(imagesUrl),
      fetch(ephemeraUrl),
    ]);

    if (!transcriptResponse.ok || !imagesResponse.ok || !ephemeraResponse.ok) {
      throw new Response("Failed to fetch data", { status: 500 });
    }

    const transcriptCsv = await transcriptResponse.text();
    const transcriptItems = processTranscriptCsv(transcriptCsv);

    const imageItems: ImageItem[] = await imagesResponse.json();

    const ephemeraItems: EphemeraItem[] = await ephemeraResponse.json();

    return { transcriptItems, imageItems, ephemeraItems };
  } catch (error) {
    return {
      transcriptItems: [],
      imageItems: [],
      ephemeraItems: [],
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

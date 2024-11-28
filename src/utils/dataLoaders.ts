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

  try {
    const [transcriptResponse, imagesResponse] = await Promise.all([
      fetch(transcriptUrl),
      fetch(imagesUrl),
    ]);

    if (!transcriptResponse.ok || !imagesResponse.ok) {
      throw new Response("Failed to fetch data", { status: 500 });
    }

    const transcriptCsv = await transcriptResponse.text();
    const imageItems: ImageItem[] = await imagesResponse.json();
    const transcriptItems = processTranscriptCsv(transcriptCsv);

    return { transcriptItems, imageItems };
  } catch (error) {
    return {
      transcriptItems: [],
      imageItems: [],
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

import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  fetchDataAvailabilities,
  fetchCommTranscript,
  fetchEphemera,
  fetchEarthPhotography,
  fetchYoutubeData,
  fetchActivitySummary,
  fetchBlogArticles,
} from "../api/dataFetchers";
import {
  useEvaDetails,
  useCrewArrDep,
  useExpeditionInfo,
  useFlights,
  useFlightsSupply,
} from "./useIndexPageData";

// Date-specific data hooks
export function useDataAvailability(
  date: string
): UseQueryResult<DataAvailability | undefined, Error> {
  return useQuery({
    queryKey: ["dataAvailability", date],
    queryFn: async () => {
      const availabilities = await fetchDataAvailabilities();
      return availabilities.find((da) => da.date === date);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!date,
  });
}

export function useCommTranscript(
  date: string,
  enabled: boolean = true
): UseQueryResult<CommItem[], Error> {
  return useQuery({
    queryKey: ["commTranscript", date],
    queryFn: () => fetchCommTranscript(date),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!date && enabled,
  });
}

export function useEphemera(date: string): UseQueryResult<EphemeraItem[], Error> {
  return useQuery({
    queryKey: ["ephemera", date],
    queryFn: () => fetchEphemera(date),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!date,
  });
}

export function useEarthPhotography(
  date: string,
  enabled: boolean = true
): UseQueryResult<EarthPhotographyItem[], Error> {
  return useQuery({
    queryKey: ["earthPhotography", date],
    queryFn: () => fetchEarthPhotography(date),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!date && enabled,
  });
}

export function useYoutubeData(
  enabled: boolean = true
): UseQueryResult<YoutubeLiveRecording[], Error> {
  return useQuery({
    queryKey: ["youtubeData"],
    queryFn: fetchYoutubeData,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled,
  });
}

export function useActivitySummary(
  date: string,
  enabled: boolean = true
): UseQueryResult<ActivitySummary, Error> {
  return useQuery({
    queryKey: ["activitySummary", date],
    queryFn: () => fetchActivitySummary(date),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!date && enabled,
  });
}

export function useBlogArticles(
  date: string,
  enabled: boolean = true
): UseQueryResult<BlogArticle[], Error> {
  return useQuery({
    queryKey: ["blogArticles", date],
    queryFn: () => fetchBlogArticles(date),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!date && enabled,
  });
}

// Combined hook for all date page data
interface DatePageDataState {
  data?: GetDatePageDataResponse;
  isLoading: boolean;
  error: Error | null;
  isSuccess: boolean;
}

export function useDatePageData(date: string): DatePageDataState {
  // Get data availability first to determine what to fetch
  const dataAvailabilityQuery = useDataAvailability(date);
  const dataAvailability = dataAvailabilityQuery.data;

  // Common data (always fetched)
  const evaDetailsQuery = useEvaDetails();
  const crewArrDepQuery = useCrewArrDep();
  const expeditionInfoQuery = useExpeditionInfo();
  const flightsQuery = useFlights();
  const flightsSupplyQuery = useFlightsSupply();
  const ephemeraQuery = useEphemera(date);

  // Conditional data (based on availability)
  const commTranscriptQuery = useCommTranscript(date, !!dataAvailability?.comm);
  const earthPhotographyQuery = useEarthPhotography(date, !!dataAvailability?.earthPhotography);
  const youtubeQuery = useYoutubeData(!!dataAvailability?.youtube);
  const activitySummaryQuery = useActivitySummary(date, !!dataAvailability?.activitySummary);
  const blogArticlesQuery = useBlogArticles(date, !!dataAvailability?.blog);

  // Check if any query is loading
  const isLoading =
    dataAvailabilityQuery.isLoading ||
    evaDetailsQuery.isLoading ||
    crewArrDepQuery.isLoading ||
    expeditionInfoQuery.isLoading ||
    flightsQuery.isLoading ||
    flightsSupplyQuery.isLoading ||
    ephemeraQuery.isLoading ||
    (dataAvailability?.comm && commTranscriptQuery.isLoading) ||
    (dataAvailability?.earthPhotography && earthPhotographyQuery.isLoading) ||
    (dataAvailability?.youtube && youtubeQuery.isLoading) ||
    (dataAvailability?.activitySummary && activitySummaryQuery.isLoading) ||
    (dataAvailability?.blog && blogArticlesQuery.isLoading);

  // Check if any query has an error
  const error =
    dataAvailabilityQuery.error ||
    evaDetailsQuery.error ||
    crewArrDepQuery.error ||
    expeditionInfoQuery.error ||
    flightsQuery.error ||
    flightsSupplyQuery.error ||
    ephemeraQuery.error ||
    commTranscriptQuery.error ||
    earthPhotographyQuery.error ||
    youtubeQuery.error ||
    activitySummaryQuery.error ||
    blogArticlesQuery.error;

  // Check if all required queries are successful
  const isSuccess =
    dataAvailabilityQuery.isSuccess &&
    evaDetailsQuery.isSuccess &&
    crewArrDepQuery.isSuccess &&
    expeditionInfoQuery.isSuccess &&
    flightsQuery.isSuccess &&
    flightsSupplyQuery.isSuccess &&
    ephemeraQuery.isSuccess &&
    (!dataAvailability?.comm || commTranscriptQuery.isSuccess) &&
    (!dataAvailability?.earthPhotography || earthPhotographyQuery.isSuccess) &&
    (!dataAvailability?.youtube || youtubeQuery.isSuccess) &&
    (!dataAvailability?.activitySummary || activitySummaryQuery.isSuccess) &&
    (!dataAvailability?.blog || blogArticlesQuery.isSuccess);

  // Combine data when all queries are successful
  const data = useMemo(() => {
    return isSuccess && dataAvailability
      ? {
          transcriptItems: commTranscriptQuery.data || [],
          earthPhotographyItems: earthPhotographyQuery.data || [],
          ephemeraItems: ephemeraQuery.data || [],
          evaDetails: evaDetailsQuery.data || [],
          dataAvailability,
          youtubeLiveRecordings: youtubeQuery.data || [],
          crewArrDep: crewArrDepQuery.data || [],
          expeditionInfo: expeditionInfoQuery.data || [],
          flights: flightsQuery.data || [],
          flightsSupply: flightsSupplyQuery.data || [],
          activitySummary: activitySummaryQuery.data || {},
          blogArticles: blogArticlesQuery.data || [],
        }
      : undefined;
  }, [
    isSuccess,
    dataAvailability,
    commTranscriptQuery.data,
    earthPhotographyQuery.data,
    ephemeraQuery.data,
    evaDetailsQuery.data,
    youtubeQuery.data,
    crewArrDepQuery.data,
    expeditionInfoQuery.data,
    flightsQuery.data,
    flightsSupplyQuery.data,
    activitySummaryQuery.data,
    blogArticlesQuery.data,
  ]);

  return {
    data,
    isLoading,
    error,
    isSuccess,
  };
}

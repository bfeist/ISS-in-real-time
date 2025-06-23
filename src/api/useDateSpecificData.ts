import { useQuery, UseQueryResult } from "@tanstack/react-query";
import {
  fetchDataAvailabilities,
  fetchCommTranscript,
  fetchEphemera,
  fetchEarthPhotography,
  fetchActivitySummary,
  fetchBlogArticles,
} from "./dataFetchers";

// Date-specific data hooks
export function useDateDataAvailability(
  date: string
): UseQueryResult<DataAvailability | undefined, Error> {
  return useQuery({
    queryKey: ["dataAvailability", date],
    queryFn: async () => {
      const availabilities = await fetchDataAvailabilities();
      return availabilities.find((da) => da.date === date);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 1000, // Reduced from 10 to 2 minutes
    enabled: !!date,
  });
}

export function useDateCommTranscript(
  date: string,
  enabled: boolean = true
): UseQueryResult<CommItem[], Error> {
  const dataAvailabilityQuery = useDateDataAvailability(date);
  const isCommAvailable = dataAvailabilityQuery.data?.comm;

  return useQuery({
    queryKey: ["commTranscript", date],
    queryFn: () => fetchCommTranscript(date),
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 1000, // Reduced from 10 to 2 minutes
    enabled: !!date && enabled && !!isCommAvailable,
  });
}

export function useDateEphemera(date: string): UseQueryResult<EphemeraItem[], Error> {
  return useQuery({
    queryKey: ["ephemera", date],
    queryFn: () => fetchEphemera(date),
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 1000, // Reduced from 10 to 2 minutes
    enabled: !!date,
  });
}

export function useDateEarthPhotography(
  date: string,
  enabled: boolean = true
): UseQueryResult<EarthPhotographyItem[], Error> {
  const dataAvailabilityQuery = useDateDataAvailability(date);
  const isEarthPhotographyAvailable = dataAvailabilityQuery.data?.earthPhotography;

  return useQuery({
    queryKey: ["earthPhotography", date],
    queryFn: () => fetchEarthPhotography(date),
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 1000, // Reduced from 10 to 2 minutes
    enabled: !!date && enabled && !!isEarthPhotographyAvailable,
  });
}

export function useDateActivitySummary(
  date: string,
  enabled: boolean = true
): UseQueryResult<ActivitySummary, Error> {
  const dataAvailabilityQuery = useDateDataAvailability(date);
  const isActivitySummaryAvailable = dataAvailabilityQuery.data?.activitySummary;

  return useQuery({
    queryKey: ["activitySummary", date],
    queryFn: () => fetchActivitySummary(date),
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 1000, // Reduced from 10 to 2 minutes
    enabled: !!date && enabled && !!isActivitySummaryAvailable,
  });
}

export function useDateBlogArticles(
  date: string,
  enabled: boolean = true
): UseQueryResult<BlogArticle[], Error> {
  const dataAvailabilityQuery = useDateDataAvailability(date);
  const isBlogAvailable = dataAvailabilityQuery.data?.blog;

  return useQuery({
    queryKey: ["blogArticles", date],
    queryFn: () => fetchBlogArticles(date),
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 1000, // Reduced from 10 to 2 minutes
    enabled: !!date && enabled && !!isBlogAvailable,
  });
}

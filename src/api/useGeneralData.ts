import { useQuery, UseQueryResult } from "@tanstack/react-query";
import {
  fetchDataAvailabilities,
  fetchEvaDetails,
  fetchCrewArrDep,
  fetchExpeditionInfo,
  fetchFlights,
  fetchFlightsSupply,
  fetchVideoYt,
  fetchVideoIa,
  fetchCommFirstData,
  fetchOrbitsDaily,
  fetchStats,
  fetchNotableMoments,
  fetchCloudsAvailable,
} from "./dataFetchers";

// Individual hooks for each data type
export function useGeneralDataAvailabilities(): UseQueryResult<DataAvailability[], Error> {
  return useQuery({
    queryKey: ["dataAvailabilities"],
    queryFn: fetchDataAvailabilities,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useGeneralEvaDetails(): UseQueryResult<EvaDetail[], Error> {
  return useQuery({
    queryKey: ["evaDetails"],
    queryFn: fetchEvaDetails,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useGeneralCrewArrDep(): UseQueryResult<CrewArrDepItem[], Error> {
  return useQuery({
    queryKey: ["crewArrDep"],
    queryFn: fetchCrewArrDep,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useGeneralExpeditionInfo(): UseQueryResult<ExpeditionInfo[], Error> {
  return useQuery({
    queryKey: ["expeditionInfo"],
    queryFn: fetchExpeditionInfo,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useGeneralFlights(): UseQueryResult<Flight[], Error> {
  return useQuery({
    queryKey: ["flights"],
    queryFn: fetchFlights,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useGeneralFlightsSupply(): UseQueryResult<FlightSupply[], Error> {
  return useQuery({
    queryKey: ["flightsSupply"],
    queryFn: fetchFlightsSupply,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
export function useGeneralVideoYt(): UseQueryResult<VideoYtItem[], Error> {
  return useQuery({
    queryKey: ["videoYt"],
    queryFn: fetchVideoYt,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useGeneralVideoIa(): UseQueryResult<VideoIaItem[], Error> {
  return useQuery({
    queryKey: ["videoIa"],
    queryFn: fetchVideoIa,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useCommFirstData(): UseQueryResult<Record<string, CommFirstItem>, Error> {
  return useQuery({
    queryKey: ["commFirstData"],
    queryFn: fetchCommFirstData,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useGeneralOrbitsDaily(): UseQueryResult<OrbitDaily, Error> {
  return useQuery({
    queryKey: ["orbitsDaily"],
    queryFn: fetchOrbitsDaily,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useGeneralStats(): UseQueryResult<Stats, Error> {
  return useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useGeneralNotableMoments(): UseQueryResult<NotableMomentItem[], Error> {
  return useQuery({
    queryKey: ["notableMoments"],
    queryFn: fetchNotableMoments,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useGeneralCloudsAvailable(): UseQueryResult<Record<string, string[]>[], Error> {
  return useQuery({
    queryKey: ["cloudsAvailable"],
    queryFn: fetchCloudsAvailable,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

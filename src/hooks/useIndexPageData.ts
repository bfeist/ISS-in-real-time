import { useQuery, UseQueryResult } from "@tanstack/react-query";
import {
  fetchDataAvailabilities,
  fetchEvaDetails,
  fetchCrewArrDep,
  fetchExpeditionInfo,
  fetchFlights,
  fetchFlightsSupply,
} from "../api/dataFetchers";

// Individual hooks for each data type
export function useDataAvailabilities(): UseQueryResult<DataAvailability[], Error> {
  return useQuery({
    queryKey: ["dataAvailabilities"],
    queryFn: fetchDataAvailabilities,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useEvaDetails(): UseQueryResult<EvaDetail[], Error> {
  return useQuery({
    queryKey: ["evaDetails"],
    queryFn: fetchEvaDetails,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useCrewArrDep(): UseQueryResult<CrewArrDepItem[], Error> {
  return useQuery({
    queryKey: ["crewArrDep"],
    queryFn: fetchCrewArrDep,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useExpeditionInfo(): UseQueryResult<ExpeditionInfo[], Error> {
  return useQuery({
    queryKey: ["expeditionInfo"],
    queryFn: fetchExpeditionInfo,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useFlights(): UseQueryResult<Flight[], Error> {
  return useQuery({
    queryKey: ["flights"],
    queryFn: fetchFlights,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useFlightsSupply(): UseQueryResult<FlightSupply[], Error> {
  return useQuery({
    queryKey: ["flightsSupply"],
    queryFn: fetchFlightsSupply,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Selector hook to get data availability for the selected date
export function useSelectedDateDataAvailability(
  selectedDate: string | null
): DataAvailability | null {
  const { data: dataAvailabilities } = useDataAvailabilities();

  return selectedDate
    ? dataAvailabilities?.find((item) => item.date === selectedDate) || null
    : null;
}

interface IndexPageDataState {
  data?: GetDataIndexPageDataResponse;
  isLoading: boolean;
  error: Error | null;
  isSuccess: boolean;
}

export function useIndexPageData(): IndexPageDataState {
  const dataAvailabilitiesQuery = useDataAvailabilities();
  const evaDetailsQuery = useEvaDetails();
  const crewArrDepQuery = useCrewArrDep();
  const expeditionInfoQuery = useExpeditionInfo();
  const flightsQuery = useFlights();
  const flightsSupplyQuery = useFlightsSupply();

  // Check if any query is loading
  const isLoading =
    dataAvailabilitiesQuery.isLoading ||
    evaDetailsQuery.isLoading ||
    crewArrDepQuery.isLoading ||
    expeditionInfoQuery.isLoading ||
    flightsQuery.isLoading ||
    flightsSupplyQuery.isLoading;

  // Check if any query has an error
  const error =
    dataAvailabilitiesQuery.error ||
    evaDetailsQuery.error ||
    crewArrDepQuery.error ||
    expeditionInfoQuery.error ||
    flightsQuery.error ||
    flightsSupplyQuery.error;

  // Check if all queries are successful
  const isSuccess =
    dataAvailabilitiesQuery.isSuccess &&
    evaDetailsQuery.isSuccess &&
    crewArrDepQuery.isSuccess &&
    expeditionInfoQuery.isSuccess &&
    flightsQuery.isSuccess &&
    flightsSupplyQuery.isSuccess;

  // Combine data when all queries are successful
  const data = isSuccess
    ? {
        dataAvailabilityItems: dataAvailabilitiesQuery.data || [],
        evaDetails: evaDetailsQuery.data || [],
        crewArrDep: crewArrDepQuery.data || [],
        expeditionInfo: expeditionInfoQuery.data || [],
        flights: flightsQuery.data || [],
        flightsSupply: flightsSupplyQuery.data || [],
      }
    : undefined;

  return {
    data,
    isLoading,
    error,
    isSuccess,
  };
}

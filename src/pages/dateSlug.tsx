import { useParams, useLocation } from "react-router-dom";
import EarthPhotography from "components/earthPhotography";
import styles from "./dateSlug.module.css";
import Comm from "components/comm";
import Map from "components/map";
import { JSX, useEffect, useRef, useMemo } from "react";
import { isValidTimestring } from "utils/params";
import YouTube from "components/youtube";
import { useStateClock, useStateSelectedDate, useStateToggle } from "store";
import { appSecondsFromTimeStr } from "utils/time";
import Globe from "components/globe";
import Header from "components/header/header";
import Expeditions from "components/expedition";
import CrewOnboard from "components/crewOnboard";
import EvaInfo from "components/evaInfo";
import Flights from "components/flights";
import Blog from "components/blog";
import {
  useDateDataAvailability,
  useDateCommTranscript,
  useDateEphemera,
  useDateEarthPhotography,
  useDateActivitySummary,
  useDateBlogArticles,
} from "../api/useDateSpecificData";
import {
  useGeneralCrewArrDep,
  useGeneralEvaDetails,
  useGeneralExpeditionInfo,
  useGeneralFlights,
  useGeneralFlightsSupply,
} from "../api/useGeneralData";

const DatePage = (): JSX.Element => {
  const { date } = useParams();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const t = searchParams.get("t");
  const { startClock, setClock } = useStateClock();
  const clockStartedRef = useRef<string | null>(null);

  const { setSelectedDate } = useStateSelectedDate();
  const { showGlobe } = useStateToggle();

  // Use individual hooks for better granular control
  const dataAvailabilityQuery = useDateDataAvailability(date || "");
  const commTranscriptQuery = useDateCommTranscript(date || "");
  const ephemeraQuery = useDateEphemera(date || "");
  const earthPhotographyQuery = useDateEarthPhotography(date || "");
  const activitySummaryQuery = useDateActivitySummary(date || "");
  const blogArticlesQuery = useDateBlogArticles(date || "");

  // General data hooks
  const evaDetailsQuery = useGeneralEvaDetails();
  const crewArrDepQuery = useGeneralCrewArrDep();
  const expeditionInfoQuery = useGeneralExpeditionInfo();
  const flightsQuery = useGeneralFlights();
  const flightsSupplyQuery = useGeneralFlightsSupply();

  // Check if critical data is loading
  const isLoading = dataAvailabilityQuery.isLoading || ephemeraQuery.isLoading;
  // Check for any errors
  const error =
    dataAvailabilityQuery.error ||
    commTranscriptQuery.error ||
    ephemeraQuery.error ||
    earthPhotographyQuery.error ||
    activitySummaryQuery.error ||
    blogArticlesQuery.error ||
    evaDetailsQuery.error ||
    crewArrDepQuery.error ||
    expeditionInfoQuery.error ||
    flightsQuery.error ||
    flightsSupplyQuery.error;
  // Combine data - memoize to prevent unnecessary re-renders
  const data = useMemo(() => {
    if (!dataAvailabilityQuery.data) return null;

    return {
      transcriptItems: commTranscriptQuery.data || [],
      earthPhotographyItems: earthPhotographyQuery.data || [],
      ephemeraItems: ephemeraQuery.data || [],
      evaDetails: evaDetailsQuery.data || [],
      dataAvailability: dataAvailabilityQuery.data,
      crewArrDep: crewArrDepQuery.data || [],
      expeditionInfo: expeditionInfoQuery.data || [],
      flights: flightsQuery.data || [],
      flightsSupply: flightsSupplyQuery.data || [],
      activitySummary: activitySummaryQuery.data,
      blogArticles: blogArticlesQuery.data || [],
    };
  }, [
    dataAvailabilityQuery.data,
    commTranscriptQuery.data,
    earthPhotographyQuery.data,
    ephemeraQuery.data,
    evaDetailsQuery.data,
    crewArrDepQuery.data,
    expeditionInfoQuery.data,
    flightsQuery.data,
    flightsSupplyQuery.data,
    activitySummaryQuery.data,
    blogArticlesQuery.data,
  ]);

  useEffect(() => {
    // Set the selected date in the store when the component mounts
    setSelectedDate(date || null);
  }, [date, setSelectedDate]);

  // Effect to manage clock based on data
  useEffect(() => {
    if (!data || isLoading) return;

    // Only start clock once per date
    if (clockStartedRef.current !== date) {
      startClock();
      clockStartedRef.current = date || null;
    }

    if (isValidTimestring(t)) {
      setClock(appSecondsFromTimeStr(t));
    } else if (data.transcriptItems.length > 0) {
      const firstTimeStr = data.transcriptItems[0].utteranceTime;
      setClock(appSecondsFromTimeStr(firstTimeStr) - 5);
    }
  }, [t, date, isLoading, data, startClock, setClock]);

  if (isLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (error) {
    return <div className={styles.error}>Error loading data: {error.message}</div>;
  }

  if (!data) {
    return <div className={styles.error}>No data available for {date}</div>;
  }
  const { earthPhotographyItems } = data;

  return (
    <div className={styles.page}>
      <Header />
      <div className={styles.upper}>
        <div className={styles.transcriptsContainer}>
          <Comm showComm={true} />
        </div>
        <div className={styles.videoContainer}>
          <YouTube />
        </div>

        <EarthPhotography imageItems={earthPhotographyItems} />
        {showGlobe ? <Globe /> : <Map />}
      </div>

      <div className={styles.lower}>
        <div className={styles.lowerLeft}>
          <Expeditions />
          <CrewOnboard />
        </div>
        <EvaInfo />
        <Flights />
        <Blog />
      </div>
    </div>
  );
};

export default DatePage;

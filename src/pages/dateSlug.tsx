import { useParams, useLocation } from "react-router-dom";
import EarthPhotography from "components/earthPhotography";
import styles from "./dateSlug.module.css";
import Comm from "components/comm";
import Map from "components/map";
import { JSX, useEffect, useRef, useMemo } from "react";
import { isValidTimestring } from "utils/params";
import YouTube from "components/youtube";
import { getCrewMembersOnboardByDate } from "utils/onboard";
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
  useDateYoutubeData,
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
  const youtubeDataQuery = useDateYoutubeData(date || "");
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
    youtubeDataQuery.error ||
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
      youtubeLiveRecordings: youtubeDataQuery.data || [],
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
    youtubeDataQuery.data,
    crewArrDepQuery.data,
    expeditionInfoQuery.data,
    flightsQuery.data,
    flightsSupplyQuery.data,
    activitySummaryQuery.data,
    blogArticlesQuery.data,
  ]);

  // Memoize the Globe component's props to prevent unnecessary re-renders
  const globeProps = useMemo(
    () => ({
      ephemeraItems: data?.ephemeraItems || [],
      viewDate: date || "",
    }),
    [data?.ephemeraItems, date]
  );

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

    const youtubeLiveRecording = data.youtubeLiveRecordings.find(
      (recording: YoutubeLiveRecording) => recording.startTime.startsWith(date || "")
    );

    if (isValidTimestring(t)) {
      setClock(appSecondsFromTimeStr(t));
    } else if (youtubeLiveRecording) {
      setClock(appSecondsFromTimeStr(youtubeLiveRecording.startTime.split("T")[1]));
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
  const {
    earthPhotographyItems,
    evaDetails,
    youtubeLiveRecordings,
    crewArrDep,
    expeditionInfo,
    flights,
    flightsSupply,
    blogArticles,
    activitySummary,
  } = data;

  const evaDetailsForDate = evaDetails.filter((evaDetail: EvaDetail) =>
    evaDetail.startTime.startsWith(date || "")
  );
  const youtubeLiveRecording =
    youtubeLiveRecordings.filter((recording: YoutubeLiveRecording) =>
      recording.startTime.startsWith(date || "")
    )[0] || null;

  const crewOnboard = getCrewMembersOnboardByDate({ crewArrDep, dateStr: date || "" });

  const dateObj = new Date(date || "");
  const expeditions = expeditionInfo.filter(
    (exp: ExpeditionInfo) =>
      new Date(exp.start) <= dateObj && (exp.end === null || new Date(exp.end) >= dateObj)
  );

  return (
    <div className={styles.page}>
      <Header />
      <div className={styles.upper}>
        <div className={styles.transcriptsContainer}>
          <Comm showComm={true} />
        </div>
        <div className={styles.videoContainer}>
          <YouTube youtubeLiveRecording={youtubeLiveRecording} />
        </div>

        <EarthPhotography imageItems={earthPhotographyItems} />
        <div className={styles.mapContainer}>{showGlobe ? <Globe {...globeProps} /> : <Map />}</div>
      </div>

      <div className={styles.lower}>
        <div className={styles.lowerLeft}>
          <Expeditions expeditions={expeditions} />
          <CrewOnboard dateStr={date} crewOnboard={crewOnboard} />
        </div>
        {evaDetailsForDate.length > 0 && <EvaInfo evaDetails={evaDetailsForDate} />}
        <Flights date={date} flights={flights} flightsSupply={flightsSupply} />
        <Blog
          date={date}
          blogArticles={blogArticles}
          activitySummary={activitySummary || undefined}
        />
      </div>
    </div>
  );
};

export default DatePage;

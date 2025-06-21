import { useParams, useLocation } from "react-router-dom";
import EarthPhotography from "components/earthPhotography";
import styles from "./dateSlug.module.css";
import Transcript from "components/comm";
import Map from "components/map";
import { JSX, useEffect, useRef, useState, useMemo } from "react";
import { isValidTimestring } from "utils/params";
import YouTube from "components/youtube";
import { getCrewMembersOnboardByDate } from "utils/onboard";
import { useClockState, useSelectedDateState } from "store";
import { appSecondsFromTimeStr } from "utils/time";
import Globe from "components/globe";
import Header from "components/header";
import Expeditions from "components/expedition";
import CrewOnboard from "components/crewOnboard";
import EvaInfo from "components/evaInfo";
import Flights from "components/flights";
import Blog from "components/blog";
import { useDatePageData } from "../hooks";

const DatePage = (): JSX.Element => {
  const { date } = useParams();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const t = searchParams.get("t");
  const { startClock, setClock } = useClockState();
  const clockStartedRef = useRef<string | null>(null);
  const [showGlobe, setShowGlobe] = useState(true);
  const [muted, setMuted] = useState(true);

  const { setSelectedDate } = useSelectedDateState();

  const { data, isLoading, error } = useDatePageData(date || "");

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

    const youtubeLiveRecording = data.youtubeLiveRecordings.find((recording) =>
      recording.startTime.startsWith(date || "")
    );

    if (isValidTimestring(t)) {
      setClock(appSecondsFromTimeStr(t));
    } else if (youtubeLiveRecording) {
      setClock(appSecondsFromTimeStr(youtubeLiveRecording.startTime.split("T")[1]));
    } else if (data.transcriptItems.length > 0) {
      const firstTimeStr = data.transcriptItems[0].utteranceTime;
      setClock(appSecondsFromTimeStr(firstTimeStr) - 5);
    }
    // Don't include startClock/setClock in dependencies to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, data, isLoading, date]);

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
    ephemeraItems,
    evaDetails,
    dataAvailability,
    youtubeLiveRecordings,
    crewArrDep,
    expeditionInfo,
    flights,
    flightsSupply,
    blogArticles,
    activitySummary,
  } = data;

  const evaDetailsForDate = evaDetails.filter((evaDetail) =>
    evaDetail.startTime.startsWith(date || "")
  );
  const youtubeLiveRecording =
    youtubeLiveRecordings.filter((recording) => recording.startTime.startsWith(date || ""))[0] ||
    null;

  const crewOnboard = getCrewMembersOnboardByDate({ crewArrDep, dateStr: date || "" });

  const dateObj = new Date(date || "");
  const expeditions = expeditionInfo.filter(
    (exp) => new Date(exp.start) <= dateObj && (exp.end === null || new Date(exp.end) >= dateObj)
  );

  return (
    <div className={styles.page}>
      <Header
        viewDate={date}
        showGlobe={showGlobe}
        setShowGlobe={setShowGlobe}
        dataAvailability={dataAvailability}
        muted={muted}
        setMuted={setMuted}
        ephemeraItems={ephemeraItems}
      />
      <div className={styles.upper}>
        <div className={styles.transcriptsContainer}>
          <Transcript />
        </div>
        <div className={styles.videoContainer}>
          <YouTube youtubeLiveRecording={youtubeLiveRecording} />
        </div>

        <EarthPhotography imageItems={earthPhotographyItems} />
        <div className={styles.mapContainer}>
          {showGlobe ? (
            <Globe {...globeProps} />
          ) : (
            <Map ephemeraItems={ephemeraItems} viewDate={date} />
          )}
        </div>
      </div>

      <div className={styles.lower}>
        <div className={styles.lowerLeft}>
          <Expeditions expeditions={expeditions} />
          <CrewOnboard dateStr={date} crewOnboard={crewOnboard} />
        </div>
        {evaDetailsForDate.length > 0 && <EvaInfo evaDetails={evaDetailsForDate} />}
        <Flights date={date} flights={flights} flightsSupply={flightsSupply} />
        <Blog date={date} blogArticles={blogArticles} activitySummary={activitySummary} />
      </div>
    </div>
  );
};

export default DatePage;

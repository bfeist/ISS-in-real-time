import { useLoaderData, useParams, useLocation } from "react-router-dom";
import EarthPhotography from "components/earthPhotography";
import styles from "./dateSlug.module.css";
import Transcript from "components/comm";
import Map from "components/map";
import { JSX, useEffect, useRef, useState } from "react";
import { isValidTimestring } from "utils/params";
import YouTube from "components/youtube";
import { getCrewMembersOnboardByDate } from "utils/crew";
import { useClockContext } from "context/clockContext";
import { appSecondsFromTimeStr } from "utils/time";
import Globe from "components/globe";
import Header from "components/header";
import Expeditions from "components/expedition";
import CrewOnboard from "components/crewOnboard";
import EvaInfo from "components/evaInfo";
import Flights from "components/flights";
import Blog from "components/blog";

const DatePage = (): JSX.Element => {
  const { date } = useParams();
  const {
    transcriptItems,
    earthPhotographyItems,
    ephemeraItems,
    evaDetails,
    dataAvailability,
    youtubeLiveRecordings,
    crewArrDep,
    expeditionInfo,
    flights,
    blogArticles,
  } = useLoaderData() as GetDatePageDataResponse;

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const t = searchParams.get("t");

  const { clockDispatch } = useClockContext();

  const audioRef = useRef<HTMLAudioElement>(null);

  const [showGlobe, setShowGlobe] = useState(true);

  const evaDetailsForDate = evaDetails.filter((evaDetail) => evaDetail.startTime.startsWith(date));
  const youtubeLiveRecording =
    youtubeLiveRecordings.filter((recording) => recording.startTime.startsWith(date))[0] || null;

  const crewOnboard = getCrewMembersOnboardByDate({ crewArrDep, dateStr: date });

  const dateObj = new Date(date);
  const expeditions = expeditionInfo.filter(
    (exp) => new Date(exp.start) <= dateObj && new Date(exp.end) >= dateObj
  );

  console.log("evaDetailsForDate", evaDetailsForDate);

  useEffect(() => {
    clockDispatch({ type: "start" });
    if (isValidTimestring(t)) {
      clockDispatch({ type: "setAppSeconds", appSeconds: appSecondsFromTimeStr(t) });
    } else if (youtubeLiveRecording) {
      clockDispatch({
        type: "setAppSeconds",
        appSeconds: appSecondsFromTimeStr(youtubeLiveRecording.startTime.split("T")[1]),
      });
    } else if (transcriptItems.length > 0) {
      const firstTimeStr = transcriptItems[0].utteranceTime;
      clockDispatch({
        type: "setAppSeconds",
        appSeconds: appSecondsFromTimeStr(firstTimeStr) - 5,
      });
    }
  }, [t, transcriptItems, date, clockDispatch, youtubeLiveRecording]);

  return (
    <div className={styles.page}>
      <Header
        date={date}
        showGlobe={showGlobe}
        setShowGlobe={setShowGlobe}
        dataAvailability={dataAvailability}
      />
      <div className={styles.upper}>
        <div className={styles.transcriptsContainer}>
          <Transcript audioRef={audioRef} commItems={transcriptItems} viewDate={date} />
        </div>
        <div className={styles.videoContainer}>
          <YouTube youtubeLiveRecording={youtubeLiveRecording} />
        </div>

        <EarthPhotography imageItems={earthPhotographyItems} />
        <div className={styles.mapContainer}>
          {showGlobe ? (
            <Globe ephemeraItems={ephemeraItems} viewDate={date} />
          ) : (
            <Map ephemeraItems={ephemeraItems} viewDate={date} />
          )}
        </div>
      </div>

      <div className={styles.lower}>
        <Expeditions expeditions={expeditions} />
        <CrewOnboard dateStr={date} crewOnboard={crewOnboard} />
        {evaDetailsForDate.length > 0 && <EvaInfo evaDetails={evaDetailsForDate} />}
        <Flights date={date} flights={flights} />
        <Blog date={date} blogArticles={blogArticles} />
        <div className={styles.audioPlayer}>
          <audio ref={audioRef} controls muted={true}>
            <track src="" kind="captions" label="English" />
            Your browser does not support the audio element.
          </audio>
        </div>
      </div>
    </div>
  );
};

export default DatePage;

import { useLoaderData, useParams, useLocation } from "react-router-dom";
import Images from "components/images";
import styles from "./dateSlug.module.css";
import Transcript from "components/transcript";
import Map from "components/map";
import { useEffect, useState } from "react";
import { isValidTimestring } from "utils/params";
import YouTube from "components/youtube";
import { getCrewMembersOnboardByDate } from "utils/crew";
import { useClockContext } from "context/clockContext";
import { appSecondsFromTimeStr, timeStrFromAppSeconds } from "utils/time";
import Globe from "components/globe";

const DatePage = (): JSX.Element => {
  const { date } = useParams();
  const {
    transcriptItems,
    imageItems,
    ephemeraItems,
    evaDetails,
    youtubeLiveRecordings,
    crewArrDep,
    expeditionInfo,
  } = useLoaderData() as GetDatePageDataResponse;

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const t = searchParams.get("t");

  const { clock, setClock } = useClockContext();

  const [showGlobe, setShowGlobe] = useState(true);

  const evaDetailsForDate = evaDetails.filter((evaDetail) => evaDetail.startTime.startsWith(date));
  const youtubeLiveRecording =
    youtubeLiveRecordings.filter((recording) => recording.startTime.startsWith(date))[0] || null;

  const crewOnboard = getCrewMembersOnboardByDate({ crewArrDep, dateStr: date });
  const expedition = expeditionInfo.find((exp) => exp.start <= date && exp.end >= date);

  console.log("evaDetailsForDate", evaDetailsForDate);
  console.log("crewOnboard", crewOnboard);
  console.log("expedition", expedition);

  useEffect(() => {
    if (isValidTimestring(t)) {
      setClock((prev) => ({
        ...prev,
        appSeconds: appSecondsFromTimeStr(t),
        isRunning: true,
      }));
    } else if (youtubeLiveRecording) {
      setClock((prev) => ({
        ...prev,
        appSeconds: appSecondsFromTimeStr(youtubeLiveRecording.startTime.split("T")[1]),
        isRunning: true,
      }));
    } else if (transcriptItems.length > 0) {
      const firstTimeStr = transcriptItems[0].utteranceTime;
      setClock((prev) => ({
        ...prev,
        appSeconds: appSecondsFromTimeStr(firstTimeStr) - 5,
        isRunning: true,
      }));
    }
  }, [t, transcriptItems, date, setClock, youtubeLiveRecording]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button onClick={() => window.history.back()}>Back</button>
        <div>
          Date: {date} Time: {timeStrFromAppSeconds(clock.appSeconds)}
        </div>
        <button
          onClick={() => {
            setClock((prev) => ({ ...prev, isRunning: !prev.isRunning }));
          }}
        >
          {clock.isRunning ? "Pause" : "Play"}
        </button>
        <button onClick={() => setShowGlobe(!showGlobe)}>
          Show {showGlobe ? "Map" : "Globe"}{" "}
        </button>
      </div>
      <div className={styles.upper}>
        <div className={styles.videoContainer}>
          <YouTube youtubeLiveRecording={youtubeLiveRecording} />
        </div>
        <div className={styles.mapContainer}>
          {showGlobe ? (
            <Globe ephemeraItems={ephemeraItems} viewDate={date} />
          ) : (
            <Map ephemeraItems={ephemeraItems} viewDate={date} />
          )}
        </div>
      </div>

      <div className={styles.lower}>
        <Transcript transcriptItems={transcriptItems} viewDate={date} />
        <Images imageItems={imageItems} />
      </div>
    </div>
  );
};

export default DatePage;

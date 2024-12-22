import { useLoaderData, useParams, useLocation } from "react-router-dom";
import Images from "components/images";
import styles from "./dateSlug.module.css";
import Transcript from "components/transcript";
import Map from "components/map";
import { useEffect } from "react";
import { isValidTimestring } from "utils/params";
import YouTube from "components/youtube";
import { getCrewMembersOnboardByDate } from "utils/crew";
import { useClockContext } from "context/clockContext";
import { appSecondsFromTimeStr, timeStrFromAppSeconds } from "utils/time";

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
      // set the time to the time parameter in the URL
      // setTimeDef({
      //   startValue: t,
      //   startedTimestamp: new Date().getTime(),
      //   running: true,
      // });
    }

    if (transcriptItems.length > 0) {
      const firstTimeStr = transcriptItems[0].utteranceTime;
      setClock((prev) => ({
        ...prev,
        appSeconds: appSecondsFromTimeStr(firstTimeStr) - 5,
        isRunning: true,
      }));
    }
  }, [t, transcriptItems, date, setClock]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          Date: {date} Time: {timeStrFromAppSeconds(clock.appSeconds)}
        </div>
        <button
          onClick={() => {
            setClock((prev) => ({ ...prev, isRunning: !prev.isRunning }));
          }}
        >
          start/stop
        </button>
      </div>
      <div className={styles.upper}>
        <div className={styles.videoContainer}>
          <YouTube youtubeLiveRecording={youtubeLiveRecording} />
        </div>
        <div className={styles.mapContainer}>
          <Map ephemeraItems={ephemeraItems} viewDate={date} />
        </div>
      </div>

      <div className={styles.lower}>
        <div className={styles.transcriptContainer}>
          <Transcript transcriptItems={transcriptItems} viewDate={date} />
        </div>
        <Images imageItems={imageItems} />
      </div>
    </div>
  );
};

export default DatePage;

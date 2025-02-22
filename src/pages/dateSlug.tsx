import { useLoaderData, useParams, useLocation } from "react-router-dom";
import Images from "components/images";
import styles from "./dateSlug.module.css";
import Transcript from "components/transcript";
import Map from "components/map";
import { useEffect, useRef, useState } from "react";
import { isValidTimestring } from "utils/params";
import YouTube from "components/youtube";
import { getCrewMembersOnboardByDate } from "utils/crew";
import { useClockUpdate } from "context/clockContext";
import { appSecondsFromTimeStr } from "utils/time";
import Globe from "components/globe";
import Header from "components/header";
import Expeditions from "components/expedition";

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

  const setClock = useClockUpdate();

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
  console.log("crewOnboard", crewOnboard);
  console.log("expeditions", expeditions);

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
      <Header date={date} showGlobe={showGlobe} setShowGlobe={setShowGlobe} />
      <div className={styles.upper}>
        <div className={styles.transcriptsContainer}>
          <Transcript
            audioRef={audioRef}
            transcriptItems={transcriptItems.filter((transcriptItem) =>
              transcriptItem.filename.includes("_SG_1")
            )}
            viewDate={date}
          />
          <Transcript
            audioRef={audioRef}
            transcriptItems={transcriptItems.filter((transcriptItem) =>
              transcriptItem.filename.includes("_SG_2")
            )}
            viewDate={date}
          />
          <Transcript
            audioRef={audioRef}
            transcriptItems={transcriptItems.filter((transcriptItem) =>
              transcriptItem.filename.includes("_SG_3")
            )}
            viewDate={date}
          />
          <Transcript
            audioRef={audioRef}
            transcriptItems={transcriptItems.filter((transcriptItem) =>
              transcriptItem.filename.includes("_SG_4")
            )}
            viewDate={date}
          />
        </div>
        <div className={styles.videoContainer}>
          <YouTube youtubeLiveRecording={youtubeLiveRecording} />
        </div>

        <Images imageItems={imageItems} />
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
      </div>
      <div className={styles.audioPlayer}>
        <audio ref={audioRef} controls>
          <track src="" kind="captions" label="English" />
          Your browser does not support the audio element.
        </audio>
      </div>
    </div>
  );
};

export default DatePage;

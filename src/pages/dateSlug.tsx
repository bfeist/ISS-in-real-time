import { useLoaderData, useParams, useLocation } from "react-router-dom";
import Images from "components/images";
import styles from "./dateSlug.module.css";
import Transcript from "components/transcript";
import Map from "components/map";
import { useEffect, useRef, useState } from "react";
import { isValidTimestring } from "utils/params";
import { timeStringFromTimeDef } from "utils/time";
import YouTube from "components/youtube";
import { getCrewMembersOnboardByDate } from "utils/crew";

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

  const [timeDef, setTimeDef] = useState<TimeDef>({
    startValue: "00:00:00",
    startedTimestamp: new Date().getTime(),
    running: true,
  });

  const timeStrRef = useRef<HTMLSpanElement>(null);

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
      setTimeDef({
        startValue: t,
        startedTimestamp: new Date().getTime(),
        running: true,
      });
    }

    if (transcriptItems.length > 0) {
      // set the time to the first transcript item - 5 seconds
      const firstItemTimeDate = new Date(`${date}T${transcriptItems[0].utteranceTime}Z`);
      firstItemTimeDate.setSeconds(firstItemTimeDate.getSeconds() - 5);
      const firstItemTimeStr = firstItemTimeDate.toISOString().split("T")[1].split(".")[0];
      setTimeDef({
        startValue: firstItemTimeStr,
        startedTimestamp: new Date().getTime(),
        running: true,
      });
    }
  }, [t, transcriptItems, date]);

  useEffect(() => {
    const updateTime = () => {
      if (timeDef.running) {
        if (timeStrRef.current) {
          timeStrRef.current.innerHTML = timeStringFromTimeDef(timeDef);
        }
      }
    };
    const intervalId = setInterval(updateTime, 500);
    return () => {
      clearInterval(intervalId);
    };
  }, [timeDef]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          Date: {date} Time: <span ref={timeStrRef} />
        </div>
        <button
          onClick={() => {
            setTimeDef({
              startValue: timeStringFromTimeDef(timeDef),
              startedTimestamp: new Date().getTime(),
              running: !timeDef.running,
            });
          }}
        >
          start/stop
        </button>
      </div>
      <div className={styles.upper}>
        <div className={styles.videoContainer}>
          <YouTube youtubeLiveRecording={youtubeLiveRecording} timeDef={timeDef} />
        </div>
        <div className={styles.mapContainer}>
          <Map ephemeraItems={ephemeraItems} viewDate={date} timeDef={timeDef} />
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

import { useLoaderData, useParams, useLocation } from "react-router-dom";
import Images from "components/images";
import styles from "./dateSlug.module.css";
import Transcript from "components/transcript";
import Map from "components/map";
import { useEffect, useRef, useState } from "react";
import { isValidTimestring } from "utils/params";
import { timeStringFromTimeDef } from "utils/time";

const DatePage = (): JSX.Element => {
  const { date } = useParams();
  const { transcriptItems, imageItems, ephemeraItems } = useLoaderData() as GetDatePageDataResponse;

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const t = searchParams.get("t");

  const intervalRef = useRef(null);

  const [timeDef, setTimeDef] = useState<TimeDef>({
    startValue: "00:00:00",
    startedTimestamp: new Date().getTime(),
    running: true,
  });
  const [timeStr, setTimeStr] = useState<string>(null);

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
    // Create an interval to update the time based on the timeDef
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      if (timeDef.running) {
        setTimeStr(timeStringFromTimeDef(timeDef));
      }
    }, 100);
    return () => {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [timeDef]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        Date: {date} Time: {timeStr}
      </div>
      <div className={styles.upper}>
        <div className={styles.videoContainer}></div>
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

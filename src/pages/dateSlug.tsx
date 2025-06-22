import { useParams, useLocation } from "react-router-dom";
import EarthPhotography from "components/earthPhotography";
import styles from "./dateSlug.module.css";
import Comm from "components/comm";
import Map from "components/map";
import { JSX, useEffect } from "react";
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

const DatePage = (): JSX.Element => {
  const { date } = useParams();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const t = searchParams.get("t");
  const { setClock } = useStateClock();

  const { setSelectedDate } = useStateSelectedDate();
  const { showGlobe } = useStateToggle();

  useEffect(() => {
    // Set the selected date in the store when the component mounts
    setSelectedDate(date || null);
  }, [date, setSelectedDate]);

  // Effect to manage clock based on data
  useEffect(() => {
    if (!t) return;

    if (isValidTimestring(t)) {
      setClock(appSecondsFromTimeStr(t));
    }
  }, [t, setClock]);

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

        <EarthPhotography />
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

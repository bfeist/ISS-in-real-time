import { FunctionComponent, useState } from "react";
import styles from "./header.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
import { useStateToggle } from "store/hooks/useStateToggle";
import { timeStrFromAppSeconds } from "utils/time";
import ClockInterval from "../clockInterval";
import HeaderTelemetry from "./headerTelemetry";

const Header: FunctionComponent = () => {
  const { isRunning, startClock, stopClock } = useStateClock();

  const { selectedDate } = useStateSelectedDate();
  const { showGlobe, setShowGlobe, globalMute, setGlobalMute } = useStateToggle();

  const [appSeconds, setAppSeconds] = useState(0);

  return (
    <div className={styles.header}>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <div className={styles.left}>
        <div className={styles.title}>ISS in Real Time</div>
        <div className={styles.dateTime}>
          <div>Date: {selectedDate}</div>
          <div>Time: {timeStrFromAppSeconds(appSeconds)}</div>
        </div>
        <button
          onClick={() => {
            if (isRunning) {
              stopClock();
              setGlobalMute(true);
            } else {
              startClock();
              setGlobalMute(false);
            }
          }}
        >
          {isRunning ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => {
            setGlobalMute(!globalMute);
          }}
        >
          {globalMute ? "Unmute" : "Mute"}
        </button>
        <button onClick={() => setShowGlobe(!showGlobe)}>
          Show {showGlobe ? "Map" : "Globe"}{" "}
        </button>
      </div>
      <div className={styles.right}>
        <HeaderTelemetry />
      </div>
    </div>
  );
};

export default Header;

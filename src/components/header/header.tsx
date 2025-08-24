import { FunctionComponent, useState } from "react";
import styles from "./header.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
import { useStateToggle } from "store/hooks/useStateToggle";
import { hhmmssFromAppSeconds } from "utils/time";
import ClockInterval from "../panes/clockInterval";
import HeaderTelemetry from "./headerTelemetry";
import ShareButton from "./share";

const Header: FunctionComponent = () => {
  const { isRunning, startClock, stopClock } = useStateClock();

  const { selectedDate } = useStateSelectedDate();
  const { showGlobe, setShowGlobe, globalMute, setGlobalMute } = useStateToggle();

  const [appSeconds, setAppSeconds] = useState(0);

  return (
    <div className={styles.header}>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <div className={styles.left}>
        <div className={styles.titleContainer}>
          <img src="/images/header/ISS_logo.png" alt="ISS Logo" className={styles.logo} />
          <div className={styles.title}>ISS in Real Time</div>
          <div className={styles.blurb}>
            Flight follow 25 years on the International
            <br />
            Space Station in Real Time
          </div>
        </div>
      </div>
      <div className={styles.centerContainer}>
        <div className={styles.centerWithBackground}>
          <div className={styles.dateTimeContainer}>
            <div>{selectedDate}</div>
            <div>+{hhmmssFromAppSeconds(appSeconds)} Z</div>
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
          <button onClick={() => setShowGlobe(!showGlobe)}>{showGlobe ? "Map" : "Globe"}</button>
          <ShareButton selectedDate={selectedDate} appSeconds={appSeconds} />
        </div>
      </div>
      <div className={styles.right}>
        <HeaderTelemetry />
      </div>
    </div>
  );
};

export default Header;

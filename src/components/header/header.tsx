import { FunctionComponent, useState } from "react";
import styles from "./header.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
import { useStateToggle } from "store/hooks/useStateToggle";
import { hhmmssFromAppSeconds } from "utils/time";
import {
  faPlay,
  faPause,
  faVolumeUp,
  faVolumeMute,
  faGlobe,
  faMap,
} from "@fortawesome/free-solid-svg-icons";
import ClockInterval from "../panes/clockInterval";
import HeaderTelemetry from "./headerTelemetry";
import ShareButton from "./share";
import IconButton from "./iconButton";

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
            Explore 25 years onboard the
            <br />
            International Space Station
          </div>
        </div>
      </div>
      <div className={styles.centerContainer}>
        <div className={styles.centerWithBackground}>
          {selectedDate ? (
            <>
              <div className={styles.dateTimeContainer}>
                <div>{selectedDate}</div>
                <div>+{hhmmssFromAppSeconds(appSeconds)} Z</div>
              </div>
              <div className={styles.buttons}>
                <IconButton
                  icon={isRunning ? faPause : faPlay}
                  flash={!isRunning}
                  onClick={() => {
                    if (isRunning) {
                      stopClock();
                    } else {
                      startClock();
                    }
                  }}
                />
                <IconButton
                  icon={globalMute ? faVolumeMute : faVolumeUp}
                  onClick={() => {
                    setGlobalMute(!globalMute);
                  }}
                />
                <IconButton
                  icon={showGlobe ? faMap : faGlobe}
                  onClick={() => setShowGlobe(!showGlobe)}
                />
                <ShareButton selectedDate={selectedDate} appSeconds={appSeconds} />
              </div>
            </>
          ) : (
            <div className={styles.noDateSelectedMessage}>Please select a date</div>
          )}
        </div>
      </div>
      <div className={styles.right}>
        <HeaderTelemetry />
      </div>
    </div>
  );
};

export default Header;

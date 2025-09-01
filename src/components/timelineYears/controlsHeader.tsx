import { FunctionComponent, useEffect, useState } from "react";
import styles from "./controlsHeader.module.css";
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
import IconButton from "../header/iconButton";
import ShareButton from "../header/share";
import HeaderTelemetry from "../header/headerTelemetry";

const ControlsHeader: FunctionComponent = () => {
  const { isRunning, startClock, stopClock, appSecondsAtStartStop, startStopTimestamp } =
    useStateClock();
  const { selectedDate } = useStateSelectedDate();
  const { showGlobe, setShowGlobe, globalMute, setGlobalMute } = useStateToggle();
  const [appSeconds, _setAppSeconds] = useState(0);

  // Update local appSeconds based on clock, similar to ClockInterval but inline
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const computeSeconds = () => {
      const secondsSinceStarted = (Date.now() - Date.parse(startStopTimestamp)) / 1000;
      return Math.floor(appSecondsAtStartStop + secondsSinceStarted);
    };

    if (isRunning) {
      if (!timer) {
        timer = setInterval(() => {
          _setAppSeconds(computeSeconds());
        }, 100);
      }
    } else {
      _setAppSeconds(computeSeconds());
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRunning, appSecondsAtStartStop, startStopTimestamp]);

  // When we don't have a selectedDate, we just show the message and no controls
  return (
    <div className={styles.controlsPositioner}>
      <div className={styles.left}>{/* Left column - empty for now */}</div>
      <div className={styles.center}>
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
                  onClick={() => (isRunning ? stopClock() : startClock())}
                />
                <IconButton
                  icon={globalMute ? faVolumeMute : faVolumeUp}
                  onClick={() => setGlobalMute(!globalMute)}
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
      <div className={styles.right}>{selectedDate && <HeaderTelemetry />}</div>
    </div>
  );
};

export default ControlsHeader;

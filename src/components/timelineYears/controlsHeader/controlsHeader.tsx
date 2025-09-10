import { FunctionComponent, useState, useEffect, useRef } from "react";
import styles from "./controlsHeader.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateToggle } from "store/hooks/useStateToggle";
import { hhmmssFromAppSeconds } from "utils/time";
import {
  faPlay,
  faPause,
  faVolumeUp,
  faVolumeMute,
  faClose,
  faChevronUp,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import IconButton from "../../common/iconButton";
import ShareButton from "./share";
import HeaderTelemetry from "./headerTelemetry";
import ClockInterval from "../../panes/clockInterval";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const ControlsHeader: FunctionComponent = () => {
  const { isRunning, startClock, stopClock, handleDayRollover, selectedDate, setSelectedDate } =
    useStateClock();
  const { globalMute, setGlobalMute, showTimelineYears, setShowTimelineYears } = useStateToggle();
  const [appSeconds, setAppSeconds] = useState(0);
  const rolloverTriggeredRef = useRef(false);

  // Handle day rollover when appSeconds >= 86400 (24 hours)
  useEffect(() => {
    if (appSeconds >= 86400 && selectedDate && !rolloverTriggeredRef.current) {
      rolloverTriggeredRef.current = true;
      handleDayRollover();
      // Reset the flag after a short delay to allow for the next potential rollover
      setTimeout(() => {
        rolloverTriggeredRef.current = false;
      }, 1000);
    } else if (appSeconds < 86400) {
      // Reset flag when we're back below the threshold
      rolloverTriggeredRef.current = false;
    }
  }, [appSeconds, selectedDate, handleDayRollover]);

  // When we don't have a selectedDate, we just show the message and no controls
  return (
    <div className={styles.controlsPositioner}>
      <ClockInterval setAppSeconds={setAppSeconds} />
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
                <ShareButton selectedDate={selectedDate} appSeconds={appSeconds} />
              </div>
              <FontAwesomeIcon
                icon={faClose}
                className={styles.closeDayButton}
                onClick={() => setSelectedDate(null)}
              />
            </>
          ) : (
            <div className={styles.noDateSelectedMessage}>Please select a date</div>
          )}
        </div>
      </div>
      <div className={styles.right}>{selectedDate && <HeaderTelemetry />}</div>
      <FontAwesomeIcon
        icon={showTimelineYears ? faChevronUp : faChevronDown}
        className={styles.toggleButton}
        onClick={() => setShowTimelineYears(!showTimelineYears)}
      />
    </div>
  );
};

export default ControlsHeader;

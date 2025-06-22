import { FunctionComponent, useState } from "react";
import styles from "./header.module.css";
import { useStateClock, useStateSelectedDate, useStateToggle } from "store";
import { timeStrFromAppSeconds } from "utils/time";
import ClockInterval from "../clockInterval";
import HeaderTelemetry from "./headerTelemetry";
import { useDateDataAvailability } from "api/useDateSpecificData";

const Header: FunctionComponent = () => {
  const { isRunning, startClock, stopClock } = useStateClock();

  const { selectedDate } = useStateSelectedDate();
  const { showGlobe, setShowGlobe, globalMute, setGlobalMute } = useStateToggle();

  const { data: dataAvailability, isLoading } = useDateDataAvailability(selectedDate);

  const [appSeconds, setAppSeconds] = useState(0);

  if (isLoading) {
    return <div className={styles.header}>Loading...</div>;
  }

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
        <div style={{ marginLeft: "10px" }}>
          Comm: {(dataAvailability?.comm ?? false) ? "1" : "0"} | vvComm:{" "}
          {(dataAvailability?.vvComm ?? false) ? "1" : "0"} | YouTube:{" "}
          {(dataAvailability?.youtube ?? false) ? "1" : "0"} | EVA:{" "}
          {(dataAvailability?.eva ?? false) ? "1" : "0"} | Blog:{" "}
          {(dataAvailability?.blog ?? false) ? "1" : "0"} | Activity Summary:{" "}
          {(dataAvailability?.activitySummary ?? false) ? "1" : "0"} | Earth Photography:{" "}
          {(dataAvailability?.earthPhotography ?? false) ? "1" : "0"}
        </div>
      </div>
      <div className={styles.right}>
        <HeaderTelemetry />
      </div>
    </div>
  );
};

export default Header;

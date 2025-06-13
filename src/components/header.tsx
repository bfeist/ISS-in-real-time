import { FunctionComponent, useState } from "react";
import styles from "./header.module.css";
import { useClockState } from "store";
import { timeStrFromAppSeconds } from "utils/time";
import { useNavigate } from "react-router-dom";
import ClockInterval from "./clockInterval";
import HeaderTelemetry from "./headerTelemetry";

const Header: FunctionComponent<{
  viewDate: string;
  showGlobe: boolean;
  setShowGlobe: (showGlobe: boolean) => void;
  dataAvailability: DataAvailability;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  ephemeraItems: EphemeraItem[];
}> = ({ viewDate, showGlobe, setShowGlobe, dataAvailability, muted, setMuted, ephemeraItems }) => {
  const { isRunning, startClock, stopClock } = useClockState();
  const navigate = useNavigate();

  const [appSeconds, setAppSeconds] = useState(0);

  return (
    <div className={styles.header}>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <div className={styles.left}>
        <button onClick={() => navigate(-1)}>Back</button>
        <div className={styles.dateTime}>
          <div>Date: {viewDate}</div>
          <div>Time: {timeStrFromAppSeconds(appSeconds)}</div>
        </div>
        <button
          onClick={() => {
            if (isRunning) {
              stopClock();
              setMuted(true);
            } else {
              startClock();
              setMuted(false);
            }
          }}
        >
          {isRunning ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => {
            setMuted(!muted);
          }}
        >
          {muted ? "Unmute" : "Mute"}
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
        <HeaderTelemetry viewDate={viewDate} ephemeraItems={ephemeraItems} />
      </div>
    </div>
  );
};

export default Header;

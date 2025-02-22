import { FunctionComponent, useState } from "react";
import styles from "./header.module.css";
import { useClockContext } from "context/clockContext";
import { timeStrFromAppSeconds } from "utils/time";
import { useNavigate } from "react-router-dom";
import ClockInterval from "./clockInterval";

const Header: FunctionComponent<{
  date: string;
  showGlobe: boolean;
  setShowGlobe: (showGlobe: boolean) => void;
}> = ({ date, showGlobe, setShowGlobe }) => {
  const { clock, clockDispatch } = useClockContext();
  const navigate = useNavigate();

  const [appSeconds, setAppSeconds] = useState(0);

  return (
    <div className={styles.header}>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <button onClick={() => navigate("/")}>Back</button>
      <div>
        Date: {date} Time: {timeStrFromAppSeconds(appSeconds)}
      </div>
      <button
        onClick={() => {
          if (clock.isRunning) {
            clockDispatch({ type: "stop" });
          } else {
            clockDispatch({ type: "start" });
          }
        }}
      >
        {clock.isRunning ? "Pause" : "Play"}
      </button>
      <button onClick={() => setShowGlobe(!showGlobe)}>Show {showGlobe ? "Map" : "Globe"} </button>
    </div>
  );
};

export default Header;

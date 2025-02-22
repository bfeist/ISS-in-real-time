import { FunctionComponent } from "react";
import styles from "./header.module.css";
import { useClockState, useClockUpdate } from "context/clockContext";
import { timeStrFromAppSeconds } from "utils/time";
import { useNavigate } from "react-router-dom";

const Header: FunctionComponent<{
  date: string;
  showGlobe: boolean;
  setShowGlobe: (showGlobe: boolean) => void;
}> = ({ date, showGlobe, setShowGlobe }) => {
  const clock = useClockState();
  const setClock = useClockUpdate();
  const navigate = useNavigate();

  return (
    <div className={styles.header}>
      <button onClick={() => navigate("/")}>Back</button>
      <div>
        Date: {date} Time: {timeStrFromAppSeconds(clock.appSeconds)}
      </div>
      <button
        onClick={() => {
          setClock((prev) => ({ ...prev, isRunning: !prev.isRunning }));
        }}
      >
        {clock.isRunning ? "Pause" : "Play"}
      </button>
      <button onClick={() => setShowGlobe(!showGlobe)}>Show {showGlobe ? "Map" : "Globe"} </button>
    </div>
  );
};

export default Header;

import { FunctionComponent, useEffect, useRef, useState } from "react";
import styles from "./header.module.css";
import { useClockContext } from "context/clockContext";
import { timeStrFromAppSeconds } from "utils/time";
import { useNavigate } from "react-router-dom";
import ClockInterval from "./clockInterval";
import { globalTelemetry } from "utils/global";

const Header: FunctionComponent<{
  date: string;
  showGlobe: boolean;
  setShowGlobe: (showGlobe: boolean) => void;
  dataAvailability: DataAvailability;
  muted: boolean;
  setMuted: (muted: boolean) => void;
}> = ({ date, showGlobe, setShowGlobe, dataAvailability, muted, setMuted }) => {
  const velocityRef = useRef<HTMLSpanElement>(null);
  const altitudeRef = useRef<HTMLSpanElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lngRef = useRef<HTMLSpanElement>(null);

  const { clock, clockDispatch } = useClockContext();
  const navigate = useNavigate();

  const [appSeconds, setAppSeconds] = useState(0);

  useEffect(() => {
    let frameId: number;

    const displayValue = () => {
      const newVelocity = globalTelemetry.velocity.toFixed(3);
      const newAltitude = globalTelemetry.altitude.toFixed(3);
      const newLat = globalTelemetry.lat.toFixed(3);
      const newLng = globalTelemetry.lng.toFixed(3);

      if (velocityRef.current && velocityRef.current.innerText !== newVelocity) {
        velocityRef.current.innerText = newVelocity;
      }
      if (altitudeRef.current && altitudeRef.current.innerText !== newAltitude) {
        altitudeRef.current.innerText = newAltitude;
      }
      if (latRef.current && latRef.current.innerText !== newLat) {
        latRef.current.innerText = newLat;
      }
      if (lngRef.current && lngRef.current.innerText !== newLng) {
        lngRef.current.innerText = newLng;
      }

      frameId = requestAnimationFrame(displayValue);
    };

    frameId = requestAnimationFrame(displayValue);

    return () => cancelAnimationFrame(frameId); // Cleanup
  }, []);

  return (
    <div className={styles.header}>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <div className={styles.left}>
        <button onClick={() => navigate("/")}>Back</button>
        <div className={styles.telemetry}>
          <div>Date: {date}</div>
          <div>Time: {timeStrFromAppSeconds(appSeconds)}</div>
        </div>
        <button
          onClick={() => {
            if (clock.isRunning) {
              clockDispatch({ type: "stop" });
              setMuted(true);
            } else {
              clockDispatch({ type: "start" });
              setMuted(false);
            }
          }}
        >
          {clock.isRunning ? "Pause" : "Play"}
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
        <div className={styles.telemetry}>
          <div>
            Velocity: <span ref={velocityRef} /> km/h
          </div>
          <div>
            Altitude: <span ref={altitudeRef} /> km
          </div>
        </div>
        <div className={styles.telemetry}>
          <div>
            Lat: <span ref={latRef} />
          </div>
          <div>
            Lng: <span ref={lngRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;

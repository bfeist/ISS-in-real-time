import { FunctionComponent, useEffect, useRef, useState, useCallback } from "react";
import styles from "./headerTelemetry.module.css";
import * as satellite from "satellite.js";
import { findClosestEphemeraItem } from "utils/map";
import { timeStrFromAppSeconds } from "utils/time";
import ClockInterval from "./clockInterval";
import { useClockState } from "store";

const HeaderTelemetry: FunctionComponent<{
  viewDate: string;
  ephemeraItems: EphemeraItem[];
}> = ({ viewDate, ephemeraItems }) => {
  const velocityRef = useRef<HTMLSpanElement>(null);
  const altitudeRef = useRef<HTMLSpanElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lngRef = useRef<HTMLSpanElement>(null);

  const [appSeconds, setAppSeconds] = useState(0);
  const [lastAppSecondsUpdate, setLastAppSecondsUpdate] = useState(Date.now());

  const { isRunning } = useClockState();

  // Update lastAppSecondsUpdate when appSeconds changes
  useEffect(() => {
    setLastAppSecondsUpdate(Date.now());
  }, [appSeconds]);

  const calcTelemetryAnimationFrame = useCallback(
    (
      satrec: satellite.SatRec,
      currentTime: Date,
      lastAppSecondsUpdate: number,
      isRunning: boolean
    ): (() => void) => {
      let frameId: number;

      const animationFrame = () => {
        if (!isRunning) {
          // If not running, don't update and don't request a new frame
          return;
        }
        // Calculate elapsed milliseconds since last appSeconds update
        const now = Date.now();
        const elapsedMs = now - lastAppSecondsUpdate;

        // Create date with partial seconds
        currentTime.setMilliseconds(currentTime.getMilliseconds() + elapsedMs);

        // Convert JS date to required time format
        const positionAndVelocity = satellite.propagate(satrec, currentTime);
        const gmst = satellite.gstime(currentTime);
        const positionEci = positionAndVelocity.position;

        if (!positionEci) {
          frameId = requestAnimationFrame(animationFrame);
          return;
        }

        // Convert ECI to geodetic coordinates
        const positionGd = satellite.eciToGeodetic(positionEci, gmst);

        // Get latitude, longitude, height in degrees/km
        const latitude = satellite.degreesLat(positionGd.latitude);
        const longitude = satellite.degreesLong(positionGd.longitude);
        const altitude = positionGd.height;
        // Calculate velocity magnitude (km/hr)
        let velocity = 0;
        if (positionAndVelocity.velocity) {
          const v = positionAndVelocity.velocity;
          velocity = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) * 3600; // Convert from km/s to km/h
        }

        if (velocityRef.current && velocityRef.current.innerText !== velocity.toFixed(3)) {
          velocityRef.current.innerText = velocity.toFixed(3);
        }
        if (altitudeRef.current && altitudeRef.current.innerText !== altitude.toFixed(3)) {
          altitudeRef.current.innerText = altitude.toFixed(3);
        }
        if (latRef.current && latRef.current.innerText !== latitude.toFixed(3)) {
          latRef.current.innerText = latitude.toFixed(3);
        }
        if (lngRef.current && lngRef.current.innerText !== longitude.toFixed(3)) {
          lngRef.current.innerText = longitude.toFixed(3);
        }

        frameId = requestAnimationFrame(animationFrame);
      };

      frameId = requestAnimationFrame(animationFrame);
      return () => cancelAnimationFrame(frameId);
    },
    [velocityRef, altitudeRef, latRef, lngRef] // isRunning will be added to dependencies of useEffect that calls this
  );

  useEffect(() => {
    const startTime = new Date(`${viewDate}T${timeStrFromAppSeconds(appSeconds)}Z`);
    const ephemeris = findClosestEphemeraItem(startTime, ephemeraItems);

    // Parse TLE into a satellite record
    const satrec = satellite.twoline2satrec(ephemeris.tle_line1, ephemeris.tle_line2);
    const currentTime = new Date(`${viewDate}T${timeStrFromAppSeconds(appSeconds)}Z`);

    // Only start the animation if isRunning is true.
    // The cleanup function will handle stopping it if isRunning becomes false or other dependencies change.
    let cleanup = () => {};
    if (isRunning) {
      cleanup = calcTelemetryAnimationFrame(satrec, currentTime, lastAppSecondsUpdate, isRunning);
    }

    return () => {
      cleanup(); // This will cancel the animation frame when the component unmounts or dependencies change
    };
  }, [
    viewDate,
    appSeconds,
    ephemeraItems,
    lastAppSecondsUpdate,
    calcTelemetryAnimationFrame,
    isRunning,
  ]);

  return (
    <>
      <ClockInterval setAppSeconds={setAppSeconds} />
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
    </>
  );
};

export default HeaderTelemetry;

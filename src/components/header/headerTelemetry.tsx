import { FunctionComponent, useEffect, useRef, useCallback } from "react";
import styles from "./headerTelemetry.module.css";
import * as satellite from "satellite.js";
import { findClosestEphemeraItem } from "utils/map";
import { hhmmssFromAppSeconds } from "utils/time";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
import { useDateEphemera } from "api/useDateSpecificData";

const HeaderTelemetry: FunctionComponent = () => {
  const { selectedDate } = useStateSelectedDate();
  const { data: ephemeraItems = [], isLoading } = useDateEphemera(selectedDate);

  const velocityRef = useRef<HTMLSpanElement>(null);
  const altitudeRef = useRef<HTMLSpanElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lngRef = useRef<HTMLSpanElement>(null);

  const { appSecondsAtStartStop, isRunning, startStopTimestamp } = useStateClock();

  const calcTelemetryAnimationFrame = useCallback(
    (satrec: satellite.SatRec, baseTime: Date, isRunning: boolean): (() => void) => {
      let frameId: number;

      const animationFrame = () => {
        if (!isRunning) {
          // If not running, don't update and don't request a new frame
          return;
        }

        // Calculate current time with millisecond precision directly
        const currentTimeMs =
          Date.parse(startStopTimestamp) +
          appSecondsAtStartStop * 1000 +
          (Date.now() - Date.parse(startStopTimestamp));
        const currentTime = new Date(currentTimeMs);

        // Convert JS date to required time format
        const positionAndVelocity = satellite.propagate(satrec, currentTime);
        const gmst = satellite.gstime(currentTime);

        if (!positionAndVelocity || !positionAndVelocity.position) {
          frameId = requestAnimationFrame(animationFrame);
          return;
        }

        const positionEci = positionAndVelocity.position;

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
    [velocityRef, altitudeRef, latRef, lngRef, appSecondsAtStartStop, startStopTimestamp]
  );

  useEffect(() => {
    if (isLoading || !ephemeraItems.length || !selectedDate) return;

    // Calculate current app seconds for finding ephemeris
    const currentAppSeconds = isRunning
      ? Math.floor(appSecondsAtStartStop + (Date.now() - Date.parse(startStopTimestamp)) / 1000)
      : appSecondsAtStartStop;

    const startTime = new Date(`${selectedDate}T${hhmmssFromAppSeconds(currentAppSeconds)}Z`);
    const ephemeris = findClosestEphemeraItem(startTime, ephemeraItems);

    // Parse TLE into a satellite record
    const satrec = satellite.twoline2satrec(ephemeris.tle_line1, ephemeris.tle_line2);
    const baseTime = new Date(`${selectedDate}T${hhmmssFromAppSeconds(currentAppSeconds)}Z`);

    // Only start the animation if isRunning is true.
    // The cleanup function will handle stopping it if isRunning becomes false or other dependencies change.
    let cleanup = () => {};
    if (isRunning) {
      cleanup = calcTelemetryAnimationFrame(satrec, baseTime, isRunning);
    }

    return () => {
      cleanup(); // This will cancel the animation frame when the component unmounts or dependencies change
    };
  }, [
    selectedDate,
    ephemeraItems,
    isLoading,
    calcTelemetryAnimationFrame,
    isRunning,
    appSecondsAtStartStop,
    startStopTimestamp,
  ]);

  return (
    <>
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

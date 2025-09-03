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
      let errorCount = 0;
      const MAX_ERRORS = 10; // Stop after 10 consecutive errors

      const animationFrame = () => {
        if (!isRunning) {
          return;
        }

        // Stop infinite error loops
        if (errorCount >= MAX_ERRORS) {
          console.error("Too many satellite propagation errors, stopping animation");
          return;
        }

        // Calculate current time with millisecond precision based on the selected date and app time
        const currentAppMs =
          appSecondsAtStartStop * 1000 + (Date.now() - Date.parse(startStopTimestamp));
        const currentAppSeconds = Math.floor(currentAppMs / 1000);
        const selectedDateTime = new Date(
          `${selectedDate}T${hhmmssFromAppSeconds(currentAppSeconds)}Z`
        );

        // Add millisecond precision for smooth animation
        const msInCurrentSecond = currentAppMs % 1000;
        const currentTime = new Date(selectedDateTime.getTime() + msInCurrentSecond);

        // Calculate satellite position
        const positionAndVelocity = satellite.propagate(satrec, currentTime);

        if (!positionAndVelocity?.position) {
          errorCount++;
          frameId = requestAnimationFrame(animationFrame);
          return;
        }

        // Reset error count on successful propagation
        errorCount = 0;

        const gmst = satellite.gstime(currentTime);
        const positionEci = positionAndVelocity.position;
        const positionGd = satellite.eciToGeodetic(positionEci, gmst);

        // Get latitude, longitude, height in degrees/km
        const latitude = satellite.degreesLat(positionGd.latitude);
        const longitude = satellite.degreesLong(positionGd.longitude);
        const altitude = positionGd.height;

        // Calculate velocity magnitude (km/hr)
        let velocity = 0;
        if (positionAndVelocity.velocity) {
          const v = positionAndVelocity.velocity;
          velocity = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) * 3600;
        }

        // Update DOM
        if (velocityRef.current) velocityRef.current.innerText = velocity.toFixed(3);
        if (altitudeRef.current) altitudeRef.current.innerText = altitude.toFixed(3);
        if (latRef.current) latRef.current.innerText = latitude.toFixed(3);
        if (lngRef.current) lngRef.current.innerText = longitude.toFixed(3);

        frameId = requestAnimationFrame(animationFrame);
      };

      frameId = requestAnimationFrame(animationFrame);
      return () => cancelAnimationFrame(frameId);
    },
    [
      velocityRef,
      altitudeRef,
      latRef,
      lngRef,
      appSecondsAtStartStop,
      startStopTimestamp,
      selectedDate,
    ]
  );

  useEffect(() => {
    if (isLoading || !ephemeraItems.length || !selectedDate) return;

    // Calculate current app seconds for finding ephemeris
    const currentAppSeconds = isRunning
      ? Math.floor(appSecondsAtStartStop + (Date.now() - Date.parse(startStopTimestamp)) / 1000)
      : appSecondsAtStartStop;

    const startTime = new Date(`${selectedDate}T${hhmmssFromAppSeconds(currentAppSeconds)}Z`);
    const ephemeris = findClosestEphemeraItem(startTime, ephemeraItems);

    // Check if we found valid ephemeris data
    if (!ephemeris || !ephemeris.tle_line1 || !ephemeris.tle_line2) {
      // Set fallback values
      if (velocityRef.current) velocityRef.current.innerText = "N/A";
      if (altitudeRef.current) altitudeRef.current.innerText = "N/A";
      if (latRef.current) latRef.current.innerText = "N/A";
      if (lngRef.current) lngRef.current.innerText = "N/A";
      return;
    }

    // Parse TLE into a satellite record
    let satrec: satellite.SatRec;
    try {
      satrec = satellite.twoline2satrec(ephemeris.tle_line1, ephemeris.tle_line2);
      if (!satrec || satrec.error) {
        return;
      }
    } catch (error) {
      return;
    }

    // Only start the animation if isRunning is true
    let cleanup = () => {};
    if (isRunning) {
      cleanup = calcTelemetryAnimationFrame(satrec, startTime, isRunning);
    }

    return () => {
      cleanup();
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
          <span className={styles.label}>Velocity</span>: <span ref={velocityRef} /> km/h
        </div>
        <div>
          <span className={styles.label}>Altitude</span>: <span ref={altitudeRef} /> km
        </div>
      </div>
      <div className={styles.telemetry}>
        <div>
          <span className={styles.label}>Lat</span>: <span ref={latRef} />
        </div>
        <div>
          <span className={styles.label}>Lng</span>: <span ref={lngRef} />
        </div>
      </div>
    </>
  );
};

export default HeaderTelemetry;

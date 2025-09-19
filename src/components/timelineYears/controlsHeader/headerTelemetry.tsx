import { FunctionComponent, useEffect, useRef, useCallback } from "react";
import styles from "./headerTelemetry.module.css";
import * as satellite from "satellite.js";
import { findClosestEphemeraItem } from "utils/map";
import { calculateCurrentOrbitNumber, formatOrbitNumber } from "utils/orbit";
import { hhmmssFromAppSeconds } from "utils/time";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateHover } from "store/hooks/useStateHover";
import { useDateEphemera } from "api/useDateSpecificData";
import { useGeneralOrbitsDaily } from "api/useGeneralData";

const HeaderTelemetry: FunctionComponent = () => {
  const { selectedDate, appSecondsAtStartStop, isRunning, startStopTimestamp } = useStateClock();
  const { hoverSeconds } = useStateHover();
  const { data: ephemeraItems = [], isLoading } = useDateEphemera(selectedDate);
  const { data: orbitsDaily = {} } = useGeneralOrbitsDaily();

  const orbitRef = useRef<HTMLSpanElement>(null);
  const velocityRef = useRef<HTMLSpanElement>(null);
  const altitudeRef = useRef<HTMLSpanElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lngRef = useRef<HTMLSpanElement>(null);

  const updateTelemetryDOM = useCallback(
    (currentTime: Date, satrec: satellite.SatRec, appSeconds: number) => {
      const positionAndVelocity = satellite.propagate(satrec, currentTime);

      if (!positionAndVelocity?.position) {
        // Set fallback values for invalid position
        if (orbitRef.current) orbitRef.current.innerText = "N/A";
        if (velocityRef.current) velocityRef.current.innerText = "N/A";
        if (altitudeRef.current) altitudeRef.current.innerText = "N/A";
        if (latRef.current) latRef.current.innerText = "N/A";
        if (lngRef.current) lngRef.current.innerText = "N/A";
        return false;
      }

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

      // Calculate current orbit number
      const orbitNumber = calculateCurrentOrbitNumber(
        selectedDate,
        appSeconds,
        ephemeraItems,
        orbitsDaily
      );

      // Update DOM
      if (orbitRef.current) orbitRef.current.innerText = formatOrbitNumber(orbitNumber);
      if (velocityRef.current) velocityRef.current.innerText = velocity.toFixed(4);
      if (altitudeRef.current) altitudeRef.current.innerText = altitude.toFixed(4);
      if (latRef.current) latRef.current.innerText = latitude.toFixed(4);
      if (lngRef.current) lngRef.current.innerText = longitude.toFixed(4);

      return true;
    },
    [selectedDate, ephemeraItems, orbitsDaily]
  );

  const calculateStaticTelemetry = useCallback(
    (satrec: satellite.SatRec, appSeconds: number) => {
      const selectedDateTime = new Date(`${selectedDate}T${hhmmssFromAppSeconds(appSeconds)}Z`);
      updateTelemetryDOM(selectedDateTime, satrec, appSeconds);
    },
    [selectedDate, updateTelemetryDOM]
  );

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

        // Use shared telemetry calculation function
        const success = updateTelemetryDOM(currentTime, satrec, currentAppSeconds);

        if (!success) {
          errorCount++;
        } else {
          // Reset error count on successful propagation
          errorCount = 0;
        }

        frameId = requestAnimationFrame(animationFrame);
      };

      frameId = requestAnimationFrame(animationFrame);
      return () => cancelAnimationFrame(frameId);
    },
    [appSecondsAtStartStop, startStopTimestamp, selectedDate, updateTelemetryDOM]
  );

  useEffect(() => {
    if (isLoading || !ephemeraItems.length || !selectedDate) return;

    // Calculate current app seconds for finding ephemeris
    let currentAppSeconds: number;

    // Use hover seconds if available, otherwise use the current clock time
    if (hoverSeconds !== null) {
      currentAppSeconds = hoverSeconds;
    } else if (isRunning) {
      currentAppSeconds = Math.floor(
        appSecondsAtStartStop + (Date.now() - Date.parse(startStopTimestamp)) / 1000
      );
    } else {
      currentAppSeconds = appSecondsAtStartStop;
    }

    const startTime = new Date(`${selectedDate}T${hhmmssFromAppSeconds(currentAppSeconds)}Z`);
    const ephemeris = findClosestEphemeraItem(startTime, ephemeraItems);

    // Check if we found valid ephemeris data
    if (!ephemeris || !ephemeris.tle_line1 || !ephemeris.tle_line2) {
      // Set fallback values
      if (orbitRef.current) orbitRef.current.innerText = "N/A";
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

    // If we have hover seconds, show static telemetry for that time
    if (hoverSeconds !== null) {
      calculateStaticTelemetry(satrec, hoverSeconds);
      return;
    }

    // Only start the animation if isRunning is true and no hover time
    let cleanup = () => {};
    if (isRunning) {
      cleanup = calcTelemetryAnimationFrame(satrec, startTime, isRunning);
    } else {
      // Show static telemetry for the current stopped time
      calculateStaticTelemetry(satrec, currentAppSeconds);
    }

    return () => {
      cleanup();
    };
  }, [
    selectedDate,
    ephemeraItems,
    isLoading,
    hoverSeconds,
    calcTelemetryAnimationFrame,
    calculateStaticTelemetry,
    isRunning,
    appSecondsAtStartStop,
    startStopTimestamp,
    orbitsDaily,
  ]);

  return (
    <div className={styles.telemetryContainer}>
      <div className={styles.telemetryGroup}>
        <div className={styles.telemetryItem}>
          <span className={styles.label}>Orbit</span>
          <span className={styles.value} ref={orbitRef} />
        </div>
      </div>
      <div className={styles.telemetryGroup}>
        <div className={styles.telemetryItemMultiLine}>
          <div className={styles.telemetryLine}>
            <span className={styles.label}>Velocity</span>
            <span className={styles.valueLeft} ref={velocityRef} />
            <span className={styles.unit}>km/h</span>
          </div>
          <div className={styles.telemetryLine}>
            <span className={styles.label}>Altitude</span>
            <span className={styles.valueLeft} ref={altitudeRef} />
            <span className={styles.unit}>km</span>
          </div>
        </div>
      </div>
      <div className={styles.telemetryGroup}>
        <div className={styles.telemetryItemMultiLine}>
          <div className={styles.telemetryLine}>
            <span className={styles.label}>Lat</span>
            <span className={styles.value} ref={latRef} />
          </div>
          <div className={styles.telemetryLine}>
            <span className={styles.label}>Lng</span>
            <span className={styles.value} ref={lngRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeaderTelemetry;

import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import styles from "./dayCounter.module.css";

// Enable duration plugin
dayjs.extend(duration);

const DayCounter: React.FC = () => {
  const [timeElapsed, setTimeElapsed] = useState({
    years: 0,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    // November 2, 2000 time of hatch opening in UTC
    const epochTimestamp = Date.UTC(2000, 10, 2, 10, 23, 0); // Month is 0-indexed

    const updateCounter = () => {
      const nowTimestamp = Date.now();

      // Total seconds elapsed
      let totalSeconds = Math.floor((nowTimestamp - epochTimestamp) / 1000);

      // Calculate years (approximate, then we'll adjust for exact days)
      const secondsPerYear = 365.25 * 24 * 60 * 60;
      const years = Math.floor(totalSeconds / secondsPerYear);
      totalSeconds -= Math.floor(years * secondsPerYear);

      // Calculate remaining time components
      const days = Math.floor(totalSeconds / (24 * 60 * 60));
      totalSeconds -= days * 24 * 60 * 60;

      const hours = Math.floor(totalSeconds / (60 * 60));
      totalSeconds -= hours * 60 * 60;

      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      setTimeElapsed({
        years,
        days,
        hours,
        minutes,
        seconds,
      });
    };

    // Update immediately
    updateCounter();

    // Update every second
    const interval = setInterval(updateCounter, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.dayCounterContainer}>
      <div className={styles.title}>Duration of continuous human presence onboard the ISS</div>
      <div className={styles.timeDisplay}>
        <span className={styles.timeUnit}>
          <span className={styles.timeValue}>{timeElapsed.years}</span>
          <span className={styles.unitLabel}>years</span>
        </span>
        <span className={styles.timeUnit}>
          <span className={styles.timeValue}>{timeElapsed.days}</span>
          <span className={styles.unitLabel}>days</span>
        </span>
        <span className={styles.timeUnit}>
          <span className={styles.timeValue}>{timeElapsed.hours.toString().padStart(2, "0")}</span>
          <span className={styles.unitLabel}>hours</span>
        </span>
        <span className={styles.timeUnit}>
          <span className={styles.timeValue}>
            {timeElapsed.minutes.toString().padStart(2, "0")}
          </span>
          <span className={styles.unitLabel}>mins</span>
        </span>
        <span className={styles.timeUnit}>
          <span className={styles.timeValue}>
            {timeElapsed.seconds.toString().padStart(2, "0")}
          </span>
          <span className={styles.unitLabel}>secs</span>
        </span>
      </div>
    </div>
  );
};

export default DayCounter;

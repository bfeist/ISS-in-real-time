import React, { useState, useEffect } from "react";
import styles from "./dayCounter.module.css";

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
    const epochDate = new Date(epochTimestamp);

    const updateCounter = () => {
      const nowTimestamp = Date.now();
      if (nowTimestamp < epochTimestamp) {
        setTimeElapsed({ years: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const nowDate = new Date(nowTimestamp);

      // Work out complete years using real anniversaries to avoid leap-year drift.
      let years = nowDate.getUTCFullYear() - epochDate.getUTCFullYear();

      const currentAnniversary = Date.UTC(
        epochDate.getUTCFullYear() + years,
        epochDate.getUTCMonth(),
        epochDate.getUTCDate(),
        epochDate.getUTCHours(),
        epochDate.getUTCMinutes(),
        epochDate.getUTCSeconds()
      );

      if (nowTimestamp < currentAnniversary) {
        years -= 1;
      }

      years = Math.max(years, 0);

      const lastAnniversary = Date.UTC(
        epochDate.getUTCFullYear() + years,
        epochDate.getUTCMonth(),
        epochDate.getUTCDate(),
        epochDate.getUTCHours(),
        epochDate.getUTCMinutes(),
        epochDate.getUTCSeconds()
      );

      let remainingMilliseconds = nowTimestamp - lastAnniversary;

      const millisecondsPerDay = 24 * 60 * 60 * 1000;
      const millisecondsPerHour = 60 * 60 * 1000;
      const millisecondsPerMinute = 60 * 1000;

      const days = Math.floor(remainingMilliseconds / millisecondsPerDay);
      remainingMilliseconds -= days * millisecondsPerDay;

      const hours = Math.floor(remainingMilliseconds / millisecondsPerHour);
      remainingMilliseconds -= hours * millisecondsPerHour;

      const minutes = Math.floor(remainingMilliseconds / millisecondsPerMinute);
      remainingMilliseconds -= minutes * millisecondsPerMinute;

      const seconds = Math.floor(remainingMilliseconds / 1000);

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

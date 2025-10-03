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
    const epochDate = dayjs("2000-11-02T10:23:00Z");

    const updateCounter = () => {
      const now = dayjs();
      const diff = dayjs.duration(now.diff(epochDate));

      // Calculate time components using dayjs duration methods
      const years = Math.floor(diff.asYears());
      const totalDays = Math.floor(diff.asDays());
      const daysInCurrentYear = totalDays - Math.floor(years * 365.25);

      setTimeElapsed({
        years,
        days: daysInCurrentYear,
        hours: diff.hours(),
        minutes: diff.minutes(),
        seconds: diff.seconds(),
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

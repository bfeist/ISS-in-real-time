import { FunctionComponent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { createDateTimeSlug } from "utils/params";
import styles from "./timeTravelCallout.module.css";

dayjs.extend(utc);

const YEAR_OFFSETS = [1, 2, 5, 10, 20, 25] as const;

type YearOffset = (typeof YEAR_OFFSETS)[number];

interface Destination {
  years: YearOffset;
  slug: string | null;
}

const TimeTravelCallout: FunctionComponent = () => {
  const navigate = useNavigate();
  const [currentUtc, setCurrentUtc] = useState(() => dayjs().utc());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const tick = () => setCurrentUtc(dayjs().utc());

    const intervalId = window.setInterval(tick, 1000);
    tick();

    return () => window.clearInterval(intervalId);
  }, []);

  const destinations = useMemo<Destination[]>(() => {
    return YEAR_OFFSETS.map((years) => {
      const targetMoment = currentUtc.subtract(years, "year");
      const targetDate = targetMoment.format("YYYY-MM-DD");
      const targetTime = targetMoment.format("HH:mm:ss");

      try {
        return {
          years,
          slug: createDateTimeSlug(targetDate, targetTime),
        };
      } catch {
        return {
          years,
          slug: null,
        };
      }
    });
  }, [currentUtc]);

  const handleNavigate = (slug: string | null) => {
    if (!slug) {
      return;
    }

    navigate(`/${slug}`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.headingContainer}>
        <div className={styles.heading}>Jump to this moment in ISS history</div>
        <span className={styles.clockValue}>{currentUtc.format("HH:mm:ss")} UTC</span>
      </div>
      <div className={styles.buttons}>
        {destinations.map(({ years, slug }) => (
          <button
            key={years}
            type="button"
            className={styles.button}
            onClick={() => handleNavigate(slug)}
            disabled={!slug}
          >
            {years} year{years > 1 ? "s" : ""} ago
          </button>
        ))}
      </div>
    </div>
  );
};

export default TimeTravelCallout;

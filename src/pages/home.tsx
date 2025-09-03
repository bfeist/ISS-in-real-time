import styles from "./home.module.css";
import { FunctionComponent, JSX, useEffect } from "react";
import { useParams } from "react-router-dom";
import DayLayout2 from "../components/dayLayout/dayLayout2";
import TimelineYearsContainer from "../components/timelineYears/timelineYearsContainer";
import { useStateSelectedDate } from "../store/hooks/useStateSelectedDate";
import { useStateClock } from "../store/hooks/useStateClock";
import { useStateToggle } from "../store/hooks/useStateToggle";
import Header from "components/header/header";
import NoDateSelected from "../components/dayLayout/noDateSelected";
import { parseDateTimeSlug } from "../utils/params";
import { appSecondsFromTimeStr } from "../utils/time";

const HomePage: FunctionComponent = (): JSX.Element => {
  const { dateTimeSlug } = useParams();
  const { selectedDate, setSelectedDate } = useStateSelectedDate();
  const { setClock } = useStateClock();
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();

  // Handle slug parameter to set date and time in Zustand state
  useEffect(() => {
    if (dateTimeSlug) {
      const parsed = parseDateTimeSlug(dateTimeSlug);
      if (parsed) {
        setSelectedDate(parsed.date);
        setClock(appSecondsFromTimeStr(parsed.time));
      }
    }
  }, [dateTimeSlug, setSelectedDate, setClock]);

  return (
    <div className={styles.page}>
      <Header />
      <TimelineYearsContainer />
      <div className={styles.contentWrapper}>
        {selectedDate ? <DayLayout2 /> : <NoDateSelected />}
        {showTimelineYears && (
          <div
            className={styles.overlay}
            onClick={() => setShowTimelineYears(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setShowTimelineYears(false);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Close timeline overlay"
          />
        )}
      </div>
    </div>
  );
};

export default HomePage;

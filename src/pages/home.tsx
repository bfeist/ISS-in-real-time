import styles from "./home.module.css";
import { FunctionComponent, JSX, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Tooltip } from "react-tooltip";
import DayLayout from "components/dayLayout/dayLayout";
import { useStateClock } from "../store/hooks/useStateClock";
import { useStateToggle } from "../store/hooks/useStateToggle";
import Header from "components/header/header";
import NoDateSelected from "../components/dayLayout/noDateSelected";
import { parseDateTimeSlug } from "../utils/params";
import { appSecondsFromTimeStr } from "../utils/time";
import TimelineYears2Container from "components/timelineYears/timelineYearsContainer";
import { isTouchDevice } from "../utils/device";

const HomePage: FunctionComponent = (): JSX.Element => {
  const { dateTimeSlug } = useParams();
  const { selectedDate, setSelectedDate, setClock } = useStateClock();
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();

  // Determine tooltip close events based on device capabilities
  const tooltipCloseEvents = useMemo(() => {
    const isTouch = isTouchDevice();

    if (isTouch) {
      // For touch devices, include touchstart to dismiss tooltips when tapping elsewhere
      return {
        mouseout: true,
        mouseleave: true,
        blur: true,
        click: true,
        touchstart: true, // This helps dismiss tooltips on mobile when tapping elsewhere
        escape: true,
      };
    } else {
      // For non-touch devices, use the standard desktop events
      return {
        mouseout: true,
        mouseleave: true,
        blur: true,
        click: true,
      };
    }
  }, []);

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
      <TimelineYears2Container />
      <div className={styles.contentContainer}>
        <div className={styles.dayContentWrapper}>
          {selectedDate ? <DayLayout /> : <NoDateSelected />}
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
      <Tooltip
        id="source-button-tooltip"
        className="tooltip-style"
        delayShow={500}
        closeEvents={tooltipCloseEvents}
      />
    </div>
  );
};

export default HomePage;

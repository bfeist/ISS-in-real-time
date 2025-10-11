import { FunctionComponent, useState, useEffect, useRef } from "react";
import styles from "./controlsHeader.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateToggle } from "store/hooks/useStateToggle";
import { hhmmssFromAppSeconds } from "utils/time";
import {
  faPlay,
  faPause,
  faClose,
  faCaretLeft,
  faCaretRight,
} from "@fortawesome/free-solid-svg-icons";
import IconButton from "../../common/iconButton";
import HeaderTelemetry from "./headerTelemetry";
import ClockInterval from "../../panes/clockInterval";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ToggleCalendarButton from "./toggleCalendarButton";
import ContentIndicatorsSection from "../subcomponents/contentIndicatorsSection";
import dayjs from "dayjs";

const ControlsHeader: FunctionComponent = () => {
  const { isRunning, startClock, stopClock, handleDayRollover, selectedDate, setDateOnly } =
    useStateClock();
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();
  const [appSeconds, setAppSeconds] = useState(0);
  const [isWideScreen, setIsWideScreen] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.innerWidth >= 1300;
  });
  const rolloverTriggeredRef = useRef(false);
  const shouldShowTelemetry = Boolean(selectedDate && isWideScreen);

  const incrementDate = (days: number) => {
    if (!selectedDate) return;
    const newDate = dayjs(selectedDate).add(days, "day");
    const epochDate = dayjs("2000-11-01");
    const today = dayjs().startOf("day");
    // Allow dates from epochDate (inclusive) to today (inclusive)
    if (newDate.isBefore(epochDate, "day") || newDate.isAfter(today, "day")) {
      return;
    }
    const newDateStr = newDate.format("YYYY-MM-DD");
    setDateOnly(newDateStr);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setIsWideScreen(window.innerWidth >= 1300);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Handle day rollover when appSeconds >= 86400 (24 hours)
  useEffect(() => {
    if (appSeconds >= 86400 && selectedDate && !rolloverTriggeredRef.current) {
      rolloverTriggeredRef.current = true;
      handleDayRollover();
      // Reset the flag after a short delay to allow for the next potential rollover
      setTimeout(() => {
        rolloverTriggeredRef.current = false;
      }, 1000);
    } else if (appSeconds < 86400) {
      // Reset flag when we're back below the threshold
      rolloverTriggeredRef.current = false;
    }
  }, [appSeconds, selectedDate, handleDayRollover]);

  // When we don't have a selectedDate, we just show the message and no controls
  return (
    <div className={styles.controlsPositioner}>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <div className={styles.left}>
        {selectedDate && isWideScreen && (
          <ContentIndicatorsSection hoveredDate={selectedDate} compact={true} />
        )}
      </div>
      <div className={styles.center}>
        <div className={styles.centerWithBackground}>
          {selectedDate ? (
            <>
              <div className={styles.dateTimeContainer}>
                <div className={styles.dateContainer}>
                  <div
                    className={styles.dateButtonLeft}
                    onClick={() => incrementDate(-1)}
                    onKeyDown={() => incrementDate(-1)}
                    role="button"
                    tabIndex={0}
                    aria-label="Previous date"
                  >
                    <FontAwesomeIcon icon={faCaretLeft} />
                  </div>
                  <div className={styles.dateValue}>{selectedDate}</div>
                  <div
                    className={styles.dateButtonRight}
                    onClick={() => incrementDate(1)}
                    onKeyDown={() => incrementDate(1)}
                    role="button"
                    tabIndex={0}
                    aria-label="Next date"
                  >
                    <FontAwesomeIcon icon={faCaretRight} />
                  </div>
                </div>
                <div className={styles.timeValue}>+{hhmmssFromAppSeconds(appSeconds)}Z</div>
              </div>
              <div className={styles.buttons}>
                <IconButton
                  icon={isRunning ? faPause : faPlay}
                  flash={!isRunning}
                  onClick={() => (isRunning ? stopClock() : startClock())}
                  tooltipContent={isRunning ? "Pause Time" : "Play Time"}
                  tooltipPlace="top"
                />
                <IconButton
                  icon={faClose}
                  className={styles.closeDayButton}
                  onClick={() => setDateOnly(null)}
                  tooltipContent="Close Day"
                  tooltipPlace="top"
                />
              </div>
            </>
          ) : (
            <div
              className={styles.noDateSelectedMessage}
              onClick={() => setShowTimelineYears(!showTimelineYears)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setShowTimelineYears(!showTimelineYears);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Select a date to begin"
            >
              Select a date to begin
            </div>
          )}
        </div>
      </div>
      <div className={styles.right}>{shouldShowTelemetry ? <HeaderTelemetry /> : null}</div>
      <ToggleCalendarButton />
    </div>
  );
};

export default ControlsHeader;

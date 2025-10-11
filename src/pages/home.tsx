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
  const { selectedDate, setDateOnly, setDateTime } = useStateClock();
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
        clickoutside: true,
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
        clickoutside: true,
      };
    }
  }, []);

  // Handle slug parameter to set date and time in Zustand state
  useEffect(() => {
    if (!dateTimeSlug) {
      setDateOnly(null);
      return;
    }

    const parsed = parseDateTimeSlug(dateTimeSlug);
    if (!parsed) {
      return;
    }
    if (parsed.time) {
      setDateTime(parsed.date, appSecondsFromTimeStr(parsed.time), { includeTimeInUrl: true });
    } else {
      setDateTime(parsed.date, null);
    }
  }, [dateTimeSlug, setDateOnly, setDateTime]);

  // Prevent pull-to-refresh on touch devices
  useEffect(() => {
    let lastTouchY = 0;

    const preventPullToRefresh = (e: TouchEvent) => {
      const touch = e.touches[0];
      const currentY = touch.clientY;

      // Calculate if user is pulling down
      const isPullingDown = currentY > lastTouchY;

      // Get the element being touched
      const target = e.target as HTMLElement;

      // Find if the target or any parent is scrollable
      let scrollableParent: HTMLElement | null = target;
      let foundScrollable = false;

      while (scrollableParent && scrollableParent !== document.body) {
        const computedStyle = window.getComputedStyle(scrollableParent);
        const overflowY = computedStyle.overflowY;

        if (overflowY === "auto" || overflowY === "scroll") {
          // Check if this element is actually scrollable (has overflow)
          if (scrollableParent.scrollHeight > scrollableParent.clientHeight) {
            foundScrollable = true;

            // If pulling down and at the top of the scrollable element, prevent
            if (isPullingDown && scrollableParent.scrollTop === 0) {
              e.preventDefault();
            }
            break;
          }
        }
        scrollableParent = scrollableParent.parentElement;
      }

      // If no scrollable parent found and pulling down at top of page, prevent
      if (!foundScrollable && isPullingDown && window.scrollY === 0) {
        e.preventDefault();
      }
    };

    const touchStart = (e: TouchEvent) => {
      lastTouchY = e.touches[0].clientY;
    };

    // Add passive: false to allow preventDefault to work
    document.addEventListener("touchstart", touchStart, { passive: true });
    document.addEventListener("touchmove", preventPullToRefresh, { passive: false });

    return () => {
      document.removeEventListener("touchstart", touchStart);
      document.removeEventListener("touchmove", preventPullToRefresh);
    };
  }, []);

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
        id="issirt-tooltip"
        className="tooltip-style"
        delayShow={500}
        closeEvents={tooltipCloseEvents}
      />
    </div>
  );
};

export default HomePage;

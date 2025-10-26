import styles from "./home.module.css";
import { FunctionComponent, JSX, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Tooltip, type TooltipRefProps } from "react-tooltip";
import DayLayout from "components/dayLayout/dayLayout";
import { useStateClock } from "../store/hooks/useStateClock";
import { useStateToggle } from "../store/hooks/useStateToggle";
import Header from "components/header/header";
import NoDateSelected from "../components/dayLayout/noDateSelected";
import { parseDateTimeSlug } from "../utils/params";
import { appSecondsFromTimeStr } from "../utils/dateTime";
import TimelineYears2Container from "components/timelineYears/timelineYearsContainer";

const HomePage: FunctionComponent = (): JSX.Element => {
  const { dateTimeSlug } = useParams();
  const { selectedDate, setDateOnly, setDateTime } = useStateClock();
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();

  const tooltipRef = useRef<TooltipRefProps | null>(null);
  const [tooltipEnabled, setTooltipEnabled] = useState(true);

  // Determine tooltip close events based on device capabilities
  const tooltipEvents = useMemo(() => {
    const closeEvents = {
      mouseout: true,
      mouseleave: true,
      blur: true,
      click: true,
      mouseup: true,
    } as const;

    const globalCloseEvents = {
      escape: true,
      clickOutsideAnchor: true,
      resize: true,
      scroll: true,
    } as const;

    return { closeEvents, globalCloseEvents };
  }, []);

  // Opt out of tooltips automatically after the app sees a touch pointer and re-enable as soon as the user switches back to a mouse or pen.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const hoverMedia = window.matchMedia("(hover: hover)");
    const finePointerMedia = window.matchMedia("(pointer: fine)");

    const evaluatePointerSupport = () => {
      const canHover = hoverMedia.matches || finePointerMedia.matches;
      setTooltipEnabled(canHover);
    };

    evaluatePointerSupport();

    const addChangeListener = (media: MediaQueryList, listener: () => void): (() => void) => {
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", listener);
        return () => media.removeEventListener("change", listener);
      }

      if (typeof media.addListener === "function") {
        media.addListener(listener);
        return () => media.removeListener(listener);
      }

      return () => {
        /* no-op */
      };
    };

    const removeHoverListener = addChangeListener(hoverMedia, evaluatePointerSupport);
    const removeFinePointerListener = addChangeListener(finePointerMedia, evaluatePointerSupport);

    return () => {
      removeHoverListener();
      removeFinePointerListener();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") {
        setTooltipEnabled(true);
        return;
      }

      if (event.pointerType === "touch") {
        setTooltipEnabled(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!tooltipEnabled) {
      tooltipRef.current?.close({ delay: 0 });
    }
  }, [tooltipEnabled]);

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

  // Ensure tooltips close when their anchor nodes unmount or when leaving the page
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      !window.MutationObserver
    ) {
      return;
    }

    const closeTooltip = () => {
      tooltipRef.current?.close({ delay: 0 });
    };

    const observer = new MutationObserver(() => {
      const activeAnchor = tooltipRef.current?.activeAnchor;

      if (activeAnchor && !document.body.contains(activeAnchor)) {
        closeTooltip();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      closeTooltip();
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
        ref={tooltipRef}
        id="issirt-tooltip"
        className="tooltip-style"
        delayShow={500}
        closeEvents={tooltipEvents.closeEvents}
        globalCloseEvents={tooltipEvents.globalCloseEvents}
        disableTooltip={() => !tooltipEnabled}
      />
    </div>
  );
};

export default HomePage;

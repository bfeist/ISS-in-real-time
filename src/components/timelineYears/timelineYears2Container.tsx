import React, {
  FunctionComponent,
  JSX,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import TimelineYears2 from "./timelineYears2";
import DateTooltip from "./subcomponents/dateTooltip/dateTooltip";
import styles from "./timelineYears2Container.module.css";
import { useGeneralDataAvailabilities } from "../../api/useGeneralData";
import { useStateClock } from "../../store/hooks/useStateClock";
import { useStateContentHighlights } from "../../store/hooks/useStateContentHighlights";
import { useStateToggle } from "../../store/hooks/useStateToggle";
import { useStateHover } from "../../store/hooks/useStateHover";
import ControlsHeader from "./controlsHeader/controlsHeader";

// Constants for year range and colors (from testtimeline.tsx)
const START_YEAR = 2000;
const END_YEAR = 2025;

// Data availability colors from timelineYearsDraw.ts
const DATA_COLORS = {
  noData: "#5b5d77",
  someData: "#6d7090",
  commData: "#7a7ea5",
};

const TimelineYears2Container: FunctionComponent = (): JSX.Element => {
  // Global state hooks
  const { selectedDate, setSelectedDate } = useStateClock();
  const { contentHighlights } = useStateContentHighlights();
  const { showTimelineYears } = useStateToggle();
  const { hoveredDate } = useStateHover();

  // Fetch data availability
  const { data: dataAvailabilityItems, isLoading, error } = useGeneralDataAvailabilities();

  // State for hover and tooltip management
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [isTouchInteraction, setIsTouchInteraction] = useState(false);
  const [pendingTouchDate, setPendingTouchDate] = useState<string | null>(null);

  // Container ref for tooltip positioning
  const containerRef = useRef<HTMLDivElement>(null);

  // Create data availability highlights from the actual data
  const dataAvailabilityHighlights = useMemo(() => {
    if (!dataAvailabilityItems) return new Map<string, string>();

    const dataHighlights = new Map<string, string>();

    // Generate highlights for all dates in the range
    for (let year = START_YEAR; year <= END_YEAR; year++) {
      for (let month = 0; month < 12; month++) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

          // Find data for this date
          const dayItem = dataAvailabilityItems.find((item) => item.date === dateStr);

          // Apply the same color logic as timelineYearsDraw.ts
          let dayColor: string;
          if (!dayItem) {
            dayColor = DATA_COLORS.noData;
          } else if (dayItem.comm || dayItem.vvComm) {
            dayColor = DATA_COLORS.commData; // Slightly brighter grey for comm data
          } else {
            dayColor = DATA_COLORS.someData;
          }

          dataHighlights.set(dateStr, dayColor);
        }
      }
    }

    return dataHighlights;
  }, [dataAvailabilityItems]);

  // Combine content highlights with data availability highlights
  const combinedHighlights = useMemo(() => {
    const combined = new Map(dataAvailabilityHighlights);

    // If we have contentHighlights selected, apply special highlighting
    if (contentHighlights.length > 0 && dataAvailabilityItems) {
      // Define highlight colors for content-highlighted dates
      const CONTENT_HIGHLIGHT_COLOR = "#7bff7d"; // Green color for content highlights

      // Check each date to see if it satisfies all content highlight criteria
      dataAvailabilityItems.forEach((dayItem) => {
        const dateStr = dayItem.date;

        // Check if all content highlights are satisfied by this day's data
        const satisfiesAllHighlights = contentHighlights.every((highlight) => {
          switch (highlight.toLowerCase()) {
            case "comm":
              return dayItem.comm;
            case "vvcomm":
              return dayItem.vvComm;
            case "video":
              return dayItem.video;
            case "eva":
              return dayItem.eva;
            case "blog":
              return dayItem.blog || dayItem.activitySummary;
            case "earthphotography":
              return dayItem.earthPhotography;
            default:
              return false;
          }
        });

        // If this date satisfies all content highlights, give it the special color
        if (satisfiesAllHighlights) {
          combined.set(dateStr, CONTENT_HIGHLIGHT_COLOR);
        }
      });
    }

    return combined;
  }, [dataAvailabilityHighlights, contentHighlights, dataAvailabilityItems]);

  // Handle touch "Go" button click
  const handleTouchGo = useCallback(() => {
    if (pendingTouchDate) {
      setSelectedDate(pendingTouchDate);
      setPendingTouchDate(null);
      setIsTouchInteraction(false);
    }
  }, [pendingTouchDate, setSelectedDate]);

  // Handle touch "Cancel" button click
  const handleTouchCancel = useCallback(() => {
    setPendingTouchDate(null);
    setIsTouchInteraction(false);
  }, []);

  // Container-scoped mouse and touch position tracking
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updatePosition = (clientX: number, clientY: number) => {
      // Only track when we have a hovered date (tooltip is relevant)
      if (hoveredDate) {
        setCursorPosition({ x: clientX, y: clientY });
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      updatePosition(event.clientX, event.clientY);
      // Reset touch interaction flag when mouse is used
      setIsTouchInteraction(false);
    };

    const handleTouchMove = (event: TouchEvent) => {
      // Use the first touch point
      if (event.touches.length > 0) {
        updatePosition(event.touches[0].clientX, event.touches[0].clientY);
      }
    };

    const handleMouseLeave = () => {
      if (!isTouchInteraction) {
        setCursorPosition(null);
      }
    };

    const handleTouchEnd = () => {
      if (!pendingTouchDate) {
        setCursorPosition(null);
      }
    };

    const handleTouchStart = () => {
      setIsTouchInteraction(true);
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd);
    container.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [hoveredDate, pendingTouchDate, isTouchInteraction]);

  // Handle loading state
  if (isLoading) {
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.loadingMessage}>Loading timeline data...</div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.errorMessage}>Error loading timeline data: {error.message}</div>
      </div>
    );
  }

  // Handle no data
  if (!dataAvailabilityItems || dataAvailabilityItems.length === 0) {
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.noDataMessage}>No timeline data available.</div>
      </div>
    );
  }

  return (
    <>
      {/* Floating Date Tooltip */}
      <DateTooltip
        hoveredDate={hoveredDate}
        cursorPosition={cursorPosition}
        isTouchInteraction={isTouchInteraction}
        showTimelineYears={showTimelineYears}
        onTouchGo={handleTouchGo}
        onTouchCancel={handleTouchCancel}
        containerRef={containerRef}
      />
      <div className={styles.container} ref={containerRef}>
        {/* Main Timeline Component */}
        <TimelineYears2 highlights={combinedHighlights} selectedDate={selectedDate} />
        <ControlsHeader />
      </div>
    </>
  );
};

export default TimelineYears2Container;

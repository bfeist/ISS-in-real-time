import React, { FunctionComponent, JSX, useMemo } from "react";
import TimelineYears2 from "./timelineYears2";
import styles from "./timelineYears2Container.module.css";
import { useGeneralDataAvailabilities } from "../../api/useGeneralData";
import { useStateClock } from "../../store/hooks/useStateClock";
import { useStateContentHighlights } from "../../store/hooks/useStateContentHighlights";
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
  const { selectedDate } = useStateClock();
  const { contentHighlights } = useStateContentHighlights();

  // Fetch data availability
  const { data: dataAvailabilityItems, isLoading, error } = useGeneralDataAvailabilities();

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

  // Handle loading state
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingMessage}>Loading timeline data...</div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorMessage}>Error loading timeline data: {error.message}</div>
      </div>
    );
  }

  // Handle no data
  if (!dataAvailabilityItems || dataAvailabilityItems.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.noDataMessage}>No timeline data available.</div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.container}>
        {/* Main Timeline Component */}
        <TimelineYears2 highlights={combinedHighlights} selectedDate={selectedDate} />
        <ControlsHeader />
      </div>
    </>
  );
};

export default TimelineYears2Container;

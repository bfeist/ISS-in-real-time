import React, { FunctionComponent, JSX, useMemo } from "react";
import TimelineYears2, { COLORS } from "./timelineYears";
import styles from "./timelineYearsContainer.module.css";
import {
  useGeneralDataAvailabilities,
  useGeneralCrewArrDep,
  useCommFirstData,
} from "../../api/useGeneralData";
import { useStateClock } from "../../store/hooks/useStateClock";
import { useStateContentHighlights } from "../../store/hooks/useStateContentHighlights";
import { useStateSearch } from "../../store/hooks/useStateSearch";
import { getCrewNormalizedName } from "utils/crew";
import { dateComponentFromDateTime } from "utils/dateTime";
import ControlsHeader from "./controlsHeader/controlsHeader";

// Constants for year range and colors (from testtimeline.tsx)
const START_YEAR = 2000;
const END_YEAR = 2025;

interface CrewStayRange {
  arrivalDate: string | null;
  departureDate: string | null;
}

const TimelineYears2Container: FunctionComponent = (): JSX.Element => {
  // Global state hooks
  const { selectedDate } = useStateClock();
  const { contentHighlights } = useStateContentHighlights();
  const { selectedCrewMember, selectedExpedition, selectedNotableMoment } = useStateSearch();

  // Fetch data availability
  const { data: dataAvailabilityItems, isLoading, error } = useGeneralDataAvailabilities();
  const { data: crewArrDep, isLoading: isLoadingCrewArrDep } = useGeneralCrewArrDep();
  const { data: commFirstData } = useCommFirstData();

  // Check if any of the required data is still loading
  const isLoadingCombined = isLoading || isLoadingCrewArrDep;

  // Compute selected crew stays
  // Use normalized names to match crew members across different name format variations
  const selectedCrewStays = useMemo<CrewStayRange[]>(() => {
    if (!crewArrDep || crewArrDep.length === 0 || !selectedCrewMember) {
      return [];
    }

    return crewArrDep
      .filter((item: CrewArrDepItem) => getCrewNormalizedName(item) === selectedCrewMember.name)
      .map((stay) => ({
        arrivalDate: dateComponentFromDateTime(stay.arrivalDate),
        departureDate: dateComponentFromDateTime(stay.departureDate),
      }));
  }, [crewArrDep, selectedCrewMember]);

  // Check if a date falls within the selected expedition
  const isDateInExpedition = useMemo(() => {
    if (!selectedExpedition) return () => false;

    const expeditionStart = new Date(selectedExpedition.start);
    // If end date is null, use current date (for ongoing expeditions)
    const expeditionEnd = selectedExpedition.end ? new Date(selectedExpedition.end) : new Date();

    return (dateStr: string) => {
      const date = new Date(dateStr);
      return date >= expeditionStart && date <= expeditionEnd;
    };
  }, [selectedExpedition]);

  // Create data availability highlights from the actual data
  const dataAvailabilityHighlights = useMemo(() => {
    if (!dataAvailabilityItems)
      return new Map<
        string,
        { fill: string; stroke?: string; expedition?: boolean; notableDatetime?: string }
      >();

    const dataHighlights = new Map<
      string,
      { fill: string; stroke?: string; expedition?: boolean; notableDatetime?: string }
    >();

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
            dayColor = COLORS.noData;
          } else if (dayItem.comm || dayItem.vvComm) {
            dayColor = COLORS.commData; // Slightly brighter grey for comm data
          } else {
            dayColor = COLORS.someData;
          }

          // Check if crew member was onboard this date
          const isCrewOnboard = selectedCrewStays.some(({ arrivalDate, departureDate }) => {
            if (!arrivalDate && !departureDate) {
              return false;
            }

            if (arrivalDate && dateStr < arrivalDate) {
              return false;
            }

            if (departureDate && dateStr > departureDate) {
              return false;
            }

            return true;
          });

          if (isCrewOnboard) {
            dayColor = COLORS.crewOnboard;
          }

          // Check if this date is part of the selected expedition
          const isExpeditionDate = isDateInExpedition(dateStr);

          dataHighlights.set(dateStr, { fill: dayColor, expedition: isExpeditionDate });
        }
      }
    }

    return dataHighlights;
  }, [dataAvailabilityItems, selectedCrewStays, isDateInExpedition]);

  // Combine content highlights with data availability highlights
  const combinedHighlights = useMemo(() => {
    const combined = new Map(dataAvailabilityHighlights);

    // If we have contentHighlights selected, add stroke highlighting without changing fill colors
    if (contentHighlights.length > 0 && dataAvailabilityItems) {
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
              return dayItem.blog || dayItem.actSum || dayItem.timeline;
            case "earthphotos":
              return dayItem.earthPhotos;
            case "flickrphotos":
              return dayItem.flickrPhotos;
            default:
              return false;
          }
        });

        // If this date satisfies all content highlights, add stroke highlighting
        if (satisfiesAllHighlights) {
          const existing = combined.get(dateStr);
          if (existing) {
            combined.set(dateStr, {
              ...existing,
              fill: COLORS.contentHighlightFill,
              stroke: COLORS.contentHighlightStroke,
            });
          } else {
            combined.set(dateStr, {
              fill: COLORS.contentHighlightFill,
              stroke: COLORS.contentHighlightStroke,
              expedition: false, // Default to no expedition if creating new entry
            });
          }
        }
      });
    }

    // If a Notable Moment item is selected, highlight its date with yellow fill
    if (selectedNotableMoment) {
      // Extract just the date portion (YYYY-MM-DD) from the datetime string
      const notableDate = selectedNotableMoment.datetime.split("T")[0];
      const existing = combined.get(notableDate);
      if (existing) {
        combined.set(notableDate, {
          ...existing,
          fill: COLORS.selected, // Use yellow color for Notable Moment items
          notableDatetime: selectedNotableMoment.datetime, // Store the full datetime for clock setting
        });
      } else {
        // If date doesn't exist in highlights yet, create it
        combined.set(notableDate, {
          fill: COLORS.selected,
          expedition: false,
          notableDatetime: selectedNotableMoment.datetime, // Store the full datetime for clock setting
        });
      }
    }
    return combined;
  }, [dataAvailabilityHighlights, contentHighlights, dataAvailabilityItems, selectedNotableMoment]);
  if (isLoadingCombined) {
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
        <TimelineYears2
          highlights={combinedHighlights}
          selectedDate={selectedDate}
          commFirstData={commFirstData}
        />
        <ControlsHeader />
      </div>
    </>
  );
};

export default TimelineYears2Container;

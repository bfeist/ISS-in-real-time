import { FunctionComponent, JSX, useMemo } from "react";
import styles from "./yearsLabels.module.css";
import { YEAR_GAP_PX } from "../../utils/indexSliderCalcs";

interface YearsLabelsProps {
  canvasWidth: number;
  onHover?: (isHovering: boolean) => void;
  onClick?: () => void;
  hoveredDate?: string | null;
  selectedDate?: string | null;
}

const YearsLabels: FunctionComponent<YearsLabelsProps> = ({
  canvasWidth,
  onClick,
  hoveredDate,
  selectedDate,
}): JSX.Element => {
  const yearPositions = useMemo(() => {
    // Use the same epoch and calculation logic as the canvas
    const epochYear = 2000;
    const epochMonth = 10; // November (0-indexed)

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const totalMonthsSinceEpoch = (currentYear - epochYear) * 12 + (currentMonth - epochMonth) + 1;

    let totalDaysSinceEpoch = 0;
    let totalYearGaps = 0;
    const years: Array<{ year: number; position: number; startDay: number }> = [];

    // First pass: calculate total days and total gaps
    let tempTotalDaysSinceEpoch = 0;
    let tempTotalYearGaps = 0;
    for (let i = 0; i < totalMonthsSinceEpoch; i++) {
      const monthDate = new Date(epochYear, epochMonth + i, 1);
      const nextMonth = new Date(monthDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(0);
      const daysInMonth = nextMonth.getDate();

      // Add gap before this month if it's January (but not the first month)
      const isJanuary = monthDate.getMonth() === 0;
      const isFirstMonth = i === 0;
      if (isJanuary && !isFirstMonth) {
        tempTotalYearGaps++;
      }

      tempTotalDaysSinceEpoch += daysInMonth;
    }

    // Calculate available width (canvas width minus total gap space)
    const availableWidth = canvasWidth - tempTotalYearGaps * YEAR_GAP_PX;

    // Second pass: calculate year positions
    for (let i = 0; i < totalMonthsSinceEpoch; i++) {
      const monthDate = new Date(epochYear, epochMonth + i, 1);
      const nextMonth = new Date(monthDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(0);
      const daysInMonth = nextMonth.getDate();

      // Add gap before this month if it's January (but not the first month)
      const isJanuary = monthDate.getMonth() === 0;
      const isFirstMonth = i === 0;
      if (isJanuary && !isFirstMonth) {
        totalYearGaps++;
      }

      // If this is January (month 0), record the year position
      if (isJanuary) {
        const basePosition = (totalDaysSinceEpoch / tempTotalDaysSinceEpoch) * availableWidth;
        const gapOffset = totalYearGaps * YEAR_GAP_PX;
        const position = basePosition + gapOffset;

        years.push({
          year: monthDate.getFullYear(),
          position,
          startDay: totalDaysSinceEpoch,
        });
      }

      totalDaysSinceEpoch += daysInMonth;
    }

    return years;
  }, [canvasWidth]);

  // Function to calculate position of a specific date
  const calculateDatePosition = useMemo(() => {
    return (dateStr: string | null): number | null => {
      if (!dateStr) return null;

      const epochYear = 2000;
      const epochMonth = 10; // November (0-indexed)

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-indexed
      const totalMonthsSinceEpoch =
        (currentYear - epochYear) * 12 + (currentMonth - epochMonth) + 1;

      let totalDaysSinceEpoch = 0;
      let totalYearGaps = 0;
      const allMonths = [];

      // Build the same month structure as the drawing code
      for (let i = 0; i < totalMonthsSinceEpoch; i++) {
        const monthDate = new Date(epochYear, epochMonth + i, 1);
        const nextMonth = new Date(monthDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(0);
        const daysInMonth = nextMonth.getDate();

        // If this is January (month 0), add a year gap (except for the very first month)
        const isJanuary = monthDate.getMonth() === 0;
        const isFirstMonth = i === 0;

        // Add gap before this month if it's January (but not the first month)
        if (isJanuary && !isFirstMonth) {
          totalYearGaps++;
        }

        allMonths.push({
          date: monthDate,
          daysInMonth,
          startDay: totalDaysSinceEpoch,
          yearGapsBefore: totalYearGaps,
          hasYearGapBefore: isJanuary && !isFirstMonth,
        });

        totalDaysSinceEpoch += daysInMonth;
      }

      // Parse the input date
      const targetDate = new Date(dateStr + "T00:00:00.000Z");
      const targetYear = targetDate.getFullYear();
      const targetMonth = targetDate.getMonth();
      const targetDay = targetDate.getDate();

      // Find the month that contains this date
      const monthEntry = allMonths.find(
        (month) => month.date.getFullYear() === targetYear && month.date.getMonth() === targetMonth
      );

      if (!monthEntry) return null;

      // Calculate the day index within the timeline
      const dayIndex = monthEntry.startDay + targetDay - 1; // -1 because targetDay is 1-indexed

      // Calculate position proportional to canvas width, accounting for year gaps
      // The available width for timeline content is reduced by the total gap space
      const availableWidth = canvasWidth - totalYearGaps * YEAR_GAP_PX;
      const basePosition = (dayIndex / totalDaysSinceEpoch) * availableWidth;
      const gapOffset = monthEntry.yearGapsBefore * YEAR_GAP_PX;
      const position = basePosition + gapOffset;

      return position;
    };
  }, [canvasWidth]);

  const hoveredDatePosition = calculateDatePosition(hoveredDate);
  const selectedDatePosition = calculateDatePosition(selectedDate);

  return (
    <div
      className={styles.yearsContainer}
      style={{ width: canvasWidth }}
      onClick={() => {
        onClick?.();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onClick?.();
        }
      }}
      tabIndex={0} // Make the div focusable
      role="button" // Indicate that this is an interactive element
      aria-label="Years timeline labels"
    >
      {yearPositions.map(({ year, position }) => (
        <div key={year} className={styles.yearLabel} style={{ left: position + 2 }}>
          {year}
        </div>
      ))}

      {/* Yellow line for hovered date */}
      {hoveredDatePosition !== null && (
        <div className={styles.hoveredDateLine} style={{ left: hoveredDatePosition }} />
      )}

      {/* Red line for selected date */}
      {selectedDatePosition !== null && (
        <div className={styles.selectedDateLine} style={{ left: selectedDatePosition }} />
      )}
    </div>
  );
};

export default YearsLabels;

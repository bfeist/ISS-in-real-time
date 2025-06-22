import { FunctionComponent, JSX, useMemo } from "react";
import styles from "./yearsLabels.module.css";

interface YearsLabelsProps {
  canvasWidth: number;
  onHover?: (isHovering: boolean) => void;
  onClick?: () => void;
  hoveredDate?: string | null;
  selectedDate?: string | null;
}

const YearsLabels: FunctionComponent<YearsLabelsProps> = ({
  canvasWidth,
  onHover,
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
    const years: Array<{ year: number; position: number; startDay: number }> = [];

    // Calculate positions for each year
    for (let i = 0; i < totalMonthsSinceEpoch; i++) {
      const monthDate = new Date(epochYear, epochMonth + i, 1);
      const nextMonth = new Date(monthDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(0);
      const daysInMonth = nextMonth.getDate();

      // If this is January (month 0), record the year position
      if (monthDate.getMonth() === 0) {
        const position =
          (totalDaysSinceEpoch /
            (() => {
              // Calculate total days to match canvas logic
              let tempTotal = 0;
              for (let j = 0; j < totalMonthsSinceEpoch; j++) {
                const tempMonthDate = new Date(epochYear, epochMonth + j, 1);
                const tempNextMonth = new Date(tempMonthDate);
                tempNextMonth.setMonth(tempNextMonth.getMonth() + 1);
                tempNextMonth.setDate(0);
                tempTotal += tempNextMonth.getDate();
              }
              return tempTotal;
            })()) *
          canvasWidth;

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
      const allMonths = [];

      // Build the same month structure as the drawing code
      for (let i = 0; i < totalMonthsSinceEpoch; i++) {
        const monthDate = new Date(epochYear, epochMonth + i, 1);
        const nextMonth = new Date(monthDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(0);
        const daysInMonth = nextMonth.getDate();

        allMonths.push({
          date: monthDate,
          daysInMonth,
          startDay: totalDaysSinceEpoch,
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

      // Calculate position proportional to canvas width
      const position = (dayIndex / totalDaysSinceEpoch) * canvasWidth;

      return position;
    };
  }, [canvasWidth]);

  const hoveredDatePosition = calculateDatePosition(hoveredDate);
  const selectedDatePosition = calculateDatePosition(selectedDate);

  const handleMouseEnter = () => {
    onHover?.(true);
  };

  const handleMouseLeave = () => {
    onHover?.(false);
  };

  return (
    <div
      className={styles.yearsContainer}
      style={{ width: canvasWidth }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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

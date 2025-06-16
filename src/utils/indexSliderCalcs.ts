const calculateDayByY = (
  y: number | null,
  currentCanvasHeight: number | null,
  year: number | null,
  month: number | null
): number | null => {
  if (
    y === null ||
    currentCanvasHeight === null ||
    currentCanvasHeight <= 0 ||
    year === null ||
    month === null
  ) {
    return null;
  }

  // Get the actual number of days in this month, accounting for leap years
  // Create a date for the first day of the next month
  const nextMonth = new Date(year, month + 1, 0);
  // Get the last day of the current month (accounts for leap years automatically)
  const actualDaysInMonth = nextMonth.getDate();

  // Calculate day height based on the actual days in this month
  const dayHeight = currentCanvasHeight / 31; // We still divide by 31 to match the canvas display

  // Calculate the day (1-indexed)
  const day = Math.floor(y / dayHeight) + 1;

  // Make sure it's a valid day (1 to actual days in month)
  return Math.min(Math.max(day, 1), actualDaysInMonth);
};

export const calculateDateFromPosition = (
  x: number,
  y: number,
  currentCanvasWidth: number | null,
  currentCanvasHeight: number | null,
  yearsAreaHeight: number = 0
): string | null => {
  if (currentCanvasWidth === null || currentCanvasHeight === null) {
    return null;
  }

  // Use the same epoch and calculation logic as the drawing code
  const epochYear = 2000;
  const epochMonth = 10; // November (0-indexed)

  // Calculate total days from epoch to now (same as drawing code)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const totalMonthsSinceEpoch = (currentYear - epochYear) * 12 + (currentMonth - epochMonth) + 1;

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

  // Calculate which day we're hovering over using the same logic as drawing
  const dayProportion = x / currentCanvasWidth;
  const hoveredDayIndex = Math.floor(dayProportion * totalDaysSinceEpoch);

  // Find which month this day belongs to
  let targetMonth = null;
  let dayWithinMonth = 0;

  for (const month of allMonths) {
    if (hoveredDayIndex >= month.startDay && hoveredDayIndex < month.startDay + month.daysInMonth) {
      targetMonth = month;
      dayWithinMonth = hoveredDayIndex - month.startDay + 1; // +1 because days are 1-indexed
      break;
    }
  }

  if (!targetMonth || dayWithinMonth < 1) {
    return null;
  }

  // Calculate day from Y position
  const day = calculateDayByY(
    y - yearsAreaHeight,
    currentCanvasHeight - yearsAreaHeight,
    targetMonth.date.getFullYear(),
    targetMonth.date.getMonth()
  );

  if (!day) {
    return null;
  }

  // Make sure the calculated day exists in the target month
  if (day > targetMonth.daysInMonth) {
    return null;
  }

  return `${targetMonth.date.getFullYear()}-${String(targetMonth.date.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

// Constants
export const YEAR_GAP_PX = 3; // Gap before January of each year

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

  // Calculate the day (1-indexed), accounting for centering offset
  // Subtract half dayHeight to account for the fact that positions are centered within days
  const adjustedY = y - dayHeight / 2;
  const day = Math.floor(adjustedY / dayHeight) + 1;

  // Make sure it's a valid day (1 to actual days in month)
  return Math.min(Math.max(day, 1), actualDaysInMonth);
};

// Shared helper function to build month structure from epoch
const buildMonthStructure = () => {
  const epochYear = 2000;
  const epochMonth = 10; // November (0-indexed)

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const totalMonthsSinceEpoch = (currentYear - epochYear) * 12 + (currentMonth - epochMonth) + 1;

  let totalDaysSinceEpoch = 0;
  let totalYearGaps = 0;
  const allMonths = [];

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

  return { allMonths, totalDaysSinceEpoch, totalYearGaps };
};

// Helper function to find month data by year and month
const findMonthData = (
  allMonths: Array<{
    date: Date;
    daysInMonth: number;
    startDay: number;
    yearGapsBefore: number;
    hasYearGapBefore: boolean;
  }>,
  year: number,
  month: number
) => {
  return allMonths.find(
    (monthItem) => monthItem.date.getFullYear() === year && monthItem.date.getMonth() === month
  );
};

export const calculatePositionFromDate = (
  dateString: string,
  canvasWidth: number,
  canvasHeight: number,
  yearsAreaHeight: number
): { x: number; y: number } | null => {
  if (!dateString || canvasWidth <= 0 || canvasHeight <= 0) return null;

  const targetDate = new Date(dateString);
  if (isNaN(targetDate.getTime())) return null;

  const { allMonths, totalDaysSinceEpoch, totalYearGaps } = buildMonthStructure();

  // Find the month that contains our target date
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();
  const targetDay = targetDate.getDate();

  // Check if the target date is within our epoch range
  const epochYear = 2000;
  const epochMonth = 10; // November (0-indexed)
  const epochDate = new Date(epochYear, epochMonth, 2); // Nov 2, 2000

  if (targetDate < epochDate) {
    console.warn(`Selected date ${dateString} is before epoch (Nov 2, 2000)`);
    return null;
  }

  const monthData = findMonthData(allMonths, targetYear, targetMonth);

  if (!monthData || targetDay > monthData.daysInMonth) {
    console.warn(`Invalid date or month data for ${dateString}`);
    return null;
  }

  // Calculate X position accounting for year gaps
  // The available width for timeline content is reduced by the total gap space
  const availableWidth = canvasWidth - totalYearGaps * YEAR_GAP_PX;
  const dayIndex = monthData.startDay + (targetDay - 1);
  const basePosition = (dayIndex / totalDaysSinceEpoch) * availableWidth;
  const gapOffset = monthData.yearGapsBefore * YEAR_GAP_PX;
  const x = basePosition + gapOffset;

  // Calculate Y position using the same logic as the drawing code
  const maxDaysInMonth = 31;
  const dayHeight = (canvasHeight - yearsAreaHeight) / maxDaysInMonth;
  // Position at the center of the day box to match drawing code
  const y = yearsAreaHeight + (targetDay - 1) * dayHeight + dayHeight / 2;

  // Validate calculated position
  if (x < 0 || y < yearsAreaHeight || y > canvasHeight) {
    console.warn(`Calculated position (${x}, ${y}) is outside canvas bounds`);
    return null;
  }

  return { x, y };
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

  const { allMonths, totalDaysSinceEpoch, totalYearGaps } = buildMonthStructure();

  // Calculate which day we're hovering over, accounting for year gaps
  // The available width for timeline content is reduced by the total gap space
  const availableWidth = currentCanvasWidth - totalYearGaps * YEAR_GAP_PX;
  let targetMonth = null;
  let dayWithinMonth = 0;

  // We need to find which month this x position corresponds to
  // by iterating through months and calculating their adjusted positions
  for (const month of allMonths) {
    const basePosition = (month.startDay / totalDaysSinceEpoch) * availableWidth;
    const gapOffset = month.yearGapsBefore * YEAR_GAP_PX;
    const monthStartX = basePosition + gapOffset;

    // Calculate the end position of this month
    const nextMonthStartDay = month.startDay + month.daysInMonth;
    const nextBasePosition = (nextMonthStartDay / totalDaysSinceEpoch) * availableWidth;
    const monthEndX = nextBasePosition + gapOffset;

    // Check if x falls within this month's range
    if (x >= monthStartX && x < monthEndX) {
      targetMonth = month;
      // Calculate day within the month based on position within the month
      const positionInMonth = x - monthStartX;
      const monthWidth = monthEndX - monthStartX;
      const dayProportion = positionInMonth / monthWidth;
      dayWithinMonth = Math.floor(dayProportion * month.daysInMonth) + 1;
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

export const calculateMonthByX = (
  x: number | null,
  currentCanvasWidth: number | null
): { year: number; month: number } | null => {
  if (x === null || currentCanvasWidth === null || currentCanvasWidth <= 0) {
    return null;
  }
  // epoch is Nov 2, 2000.
  const epochYear = 2000;
  const epochMonth = 10; // November (0-indexed)

  // Calculate totalMonths from epoch to now
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const totalMonthsSinceEpoch = (currentYear - epochYear) * 12 + (currentMonth - epochMonth) + 1;

  if (totalMonthsSinceEpoch <= 0) {
    return null;
  }

  const proportion = x / currentCanvasWidth;
  const selectedMonthIndexFromEpoch = Math.floor(proportion * totalMonthsSinceEpoch);

  const targetYear = epochYear + Math.floor(selectedMonthIndexFromEpoch / 12);
  let newCalculatedMonth = epochMonth + (selectedMonthIndexFromEpoch % 12);
  let newCalculatedYear = targetYear;

  newCalculatedYear += Math.floor(newCalculatedMonth / 12);
  newCalculatedMonth = newCalculatedMonth % 12;

  return { year: newCalculatedYear, month: newCalculatedMonth };
};

export const calculateDayByY = (
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

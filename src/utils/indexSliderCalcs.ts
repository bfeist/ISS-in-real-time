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

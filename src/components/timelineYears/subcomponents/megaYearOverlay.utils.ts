export const MEGA_OVERLAY_CELL_GAP = 1;
export const MEGA_OVERLAY_MAX_DAYS_IN_MONTH = 31;

export const getMegaDateFromCoordinates = (
  x: number,
  y: number,
  year: number,
  width: number,
  startMonth: number = 0,
  endMonth: number = 11
): string | null => {
  const cellGap = MEGA_OVERLAY_CELL_GAP;
  // Use 12-month layout for coordinate calculation
  const cellWidth = (width - (12 - 1) * cellGap) / 12;
  const cellSize = cellWidth;
  const cellSpanX = cellWidth + cellGap;
  const cellSpanY = cellSize + cellGap;
  const maxDaysInMonth = MEGA_OVERLAY_MAX_DAYS_IN_MONTH;
  const totalHeight = maxDaysInMonth * cellSpanY;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  if (y < 0 || y >= totalHeight) {
    return null;
  }

  const normalizedX = Math.min(Math.max(x, 0), width - Number.EPSILON);
  const normalizedY = Math.min(Math.max(y, 0), totalHeight - Number.EPSILON);

  let month = Math.floor(normalizedX / cellSpanX);
  const monthOffsetWithinCell = normalizedX - month * cellSpanX;

  if (monthOffsetWithinCell > cellWidth) {
    const distanceIntoGap = monthOffsetWithinCell - cellWidth;
    if (distanceIntoGap > cellGap / 2) {
      month += 1;
    }
  }

  if (month < startMonth) {
    month = startMonth;
  } else if (month > endMonth) {
    month = endMonth;
  }

  let dayIndex = Math.floor(normalizedY / cellSpanY);
  const dayOffsetWithinCell = normalizedY - dayIndex * cellSpanY;

  if (dayOffsetWithinCell > cellSize) {
    const distanceIntoGap = dayOffsetWithinCell - cellSize;
    if (distanceIntoGap > cellGap / 2) {
      dayIndex += 1;
    }
  }

  if (dayIndex < 0) {
    dayIndex = 0;
  }
  if (dayIndex >= maxDaysInMonth) {
    dayIndex = maxDaysInMonth - 1;
  }

  let day = dayIndex + 1;

  // Determine month based on 12-month grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (day > daysInMonth) {
    day = daysInMonth;
  }

  // Validate day exists in this month
  if (day < 1 || day > daysInMonth) return null;

  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

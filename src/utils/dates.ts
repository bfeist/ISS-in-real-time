/**
 * Checks if two dates represent the same day
 *
 * @param date1 - First date to compare
 * @param date2 - Second date to compare
 * @returns boolean indicating if the dates are the same day
 */
export const isSameDay = (date1: Date | null, date2: Date): boolean => {
  if (!date1) return false;
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
};

/**
 * Gets the next day from a given date string
 *
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Next day as a date string in YYYY-MM-DD format
 */
export const getNextDay = (dateString: string): string => {
  const date = new Date(dateString);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split("T")[0];
};

const hasAnyAvailabilityContent = (availability: DataAvailability | undefined): boolean => {
  if (!availability) {
    return false;
  }

  const { date: _date, ...rest } = availability;
  return Object.values(rest).some((value) => Boolean(value));
};

export const getLastDateWithData = (
  dataAvailabilities?: DataAvailability[] | null
): string | null => {
  if (!dataAvailabilities || dataAvailabilities.length === 0) {
    return null;
  }

  for (let index = dataAvailabilities.length - 1; index >= 0; index -= 1) {
    const candidate = dataAvailabilities[index];
    if (hasAnyAvailabilityContent(candidate)) {
      return candidate.date;
    }
  }

  return null;
};

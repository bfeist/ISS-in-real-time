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

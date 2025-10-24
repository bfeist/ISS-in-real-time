import { createDateTimeSlug } from "./params";
import { hhmmssFromAppSeconds } from "./dateTime";

/**
 * Generates a shareable URL for the current ISS view
 * @param selectedDate - The selected date in YYYY-MM-DD format, or null for base URL
 * @param appSeconds - The current time in seconds since midnight
 * @returns The complete shareable URL
 */
export const generateShareUrl = (selectedDate: string | null, appSeconds: number): string => {
  const baseUrl = window.location.origin;

  if (!selectedDate) {
    return baseUrl;
  }

  // Convert appSeconds to time string format
  const timeStr = hhmmssFromAppSeconds(appSeconds);

  // Create the date-time slug using the app's format
  const dateTimeSlug = createDateTimeSlug(selectedDate, timeStr);

  return `${baseUrl}/${dateTimeSlug}`;
};

import { hhmmssFromAppSeconds } from "./time";

export const isValidTimestring = (t: string): boolean => {
  if (!t) return false;

  const timeParts = t.split(":");
  if (timeParts.length !== 3) return false;
  const hours = parseInt(timeParts[0]);
  const minutes = parseInt(timeParts[1]);
  const seconds = parseInt(timeParts[2]);

  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return false;
  if (hours < 0 || hours > 23) return false;
  if (minutes < 0 || minutes > 59) return false;
  if (seconds < 0 || seconds > 59) return false;

  return true;
};

export const isValidDateString = (dateStr: string): boolean => {
  if (!dateStr) return false;

  // Check if the date string matches YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) return false;

  // Check if it's a valid date
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime()) && date.toISOString().startsWith(dateStr);
};

export interface ParsedDateTimeSlug {
  date: string;
  time: string;
}

export const parseDateTimeSlug = (slug: string): ParsedDateTimeSlug | null => {
  if (!slug) return null;

  // Expected format: YYYY-MM-DD/HH:MM:SS but encoded as YYYY-MM-DD%2FHH%3AMM%3ASS
  // or YYYY-MM-DDTHH:MM:SS (using T as separator to avoid URL encoding issues)
  let datePart: string;
  let timePart: string;

  // Try URL decoded format first (YYYY-MM-DD/HH:MM:SS)
  try {
    const decoded = decodeURIComponent(slug);
    const parts = decoded.split("/");
    if (parts.length === 2) {
      [datePart, timePart] = parts;
    } else {
      // Try alternative format with T separator (YYYY-MM-DDTHH:MM:SS)
      const altParts = slug.split("T");
      if (altParts.length === 2) {
        [datePart, timePart] = altParts;
      } else {
        return null;
      }
    }
  } catch {
    return null;
  }

  // Validate date and time formats
  if (!isValidDateString(datePart) || !isValidTimestring(timePart)) {
    return null;
  }

  return { date: datePart, time: timePart };
};

export const createDateTimeSlug = (date: string, time: string): string => {
  if (!isValidDateString(date) || !isValidTimestring(time)) {
    throw new Error("Invalid date or time format");
  }

  // Use T separator to avoid URL encoding issues with /
  return `${date}T${time}`;
};

/**
 * Generates a shareable URL for the current ISS view
 * @param selectedDate - The selected date in YYYY-MM-DD format, or null for base URL
 * @param appSeconds - The current time in seconds since midnight
 * @returns The complete shareable URL, or base URL if invalid
 */
export const generateShareUrl = (selectedDate: string | null, appSeconds: number): string => {
  const baseUrl = window.location.origin;

  if (!selectedDate || appSeconds >= 86400) {
    return baseUrl;
  }

  // Convert appSeconds to time string format
  const timeStr = hhmmssFromAppSeconds(appSeconds);

  // Create the date-time slug using the app's format
  const dateTimeSlug = createDateTimeSlug(selectedDate, timeStr);

  return `${baseUrl}/${dateTimeSlug}`;
};

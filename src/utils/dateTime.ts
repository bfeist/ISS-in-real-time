/**
 * Date helpers focused on day-level comparisons.
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
 * Returns the ISO date string for the next day.
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

/**
 * Finds the last date that contains any availability data.
 */
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

/**
 * Finds the closest date in an array to the provided datetime.
 */
export const findClosestDate = (dateTime: Date, dates: Date[]): Date | undefined => {
  if (dates.length === 0) {
    return undefined;
  }

  let closestDate = dates[0];
  let minDiff = Math.abs(closestDate.getTime() - dateTime.getTime());

  for (const current of dates) {
    const diff = Math.abs(current.getTime() - dateTime.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closestDate = current;
    }
  }

  return closestDate;
};

/**
 * Extracts the YYYY-MM-DD portion of an ISO string.
 */
export const dateComponentFromDateTime = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const [datePart] = trimmed.split("T");
  return datePart ?? null;
};

/**
 * Extracts a HH:mm:ss time component from an ISO datetime string.
 */
export const timeComponentFromDateTime = (dateTime?: string | null): string | null => {
  if (!dateTime) {
    return null;
  }

  const [, timePortionCandidate] = dateTime.split("T");
  const rawTime = timePortionCandidate ?? dateTime;
  const trimmed = rawTime.trim();

  if (!trimmed) {
    return null;
  }

  const withoutTrailingZone = trimmed.replace(/z$/i, "");
  const baseTime = withoutTrailingZone.split(/[+-]/)[0]?.trim();

  if (!baseTime) {
    return null;
  }

  const segments = baseTime.split(":");

  if (segments.length < 2) {
    return null;
  }

  const [hoursRaw, minutesRaw, secondsRaw] = segments;
  const seconds = secondsRaw ? secondsRaw.split(".")[0] : "00";

  const hours = hoursRaw.padStart(2, "0");
  const minutes = minutesRaw.padStart(2, "0");
  const secs = seconds.padStart(2, "0");

  return `${hours}:${minutes}:${secs}`;
};

/**
 * Converts a HH:mm:ss string into seconds.
 */
export const appSecondsFromTimeStr = (timeStr: string): number => {
  const [hours, minutes, seconds] = timeStr.split(":").map((value) => Number.parseInt(value, 10));
  return hours * 3600 + minutes * 60 + seconds;
};

/**
 * Extracts a HH:mm:ss time component from a datetime string and converts it to seconds.
 */
export const appSecondsFromDateTime = (dateTime?: string | null): number | null => {
  const timeComponent = timeComponentFromDateTime(dateTime);

  if (!timeComponent) {
    return null;
  }

  return appSecondsFromTimeStr(timeComponent);
};

/**
 * Formats app seconds as HH:mm:ss.
 */
export const hhmmssFromAppSeconds = (appSeconds: number): string => {
  const hours = Math.floor(appSeconds / 3600);
  const minutes = Math.floor((appSeconds % 3600) / 60);
  const seconds = Math.floor(appSeconds % 60);
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

/**
 * Converts a date string and app seconds into an ISO datetime string.
 */
export const dateTimeStrFromDateAppSeconds = ({
  dateStr,
  appSeconds,
}: {
  dateStr: string;
  appSeconds: number;
}): string => {
  const hours = Math.floor(appSeconds / 3600);
  const minutes = Math.floor((appSeconds % 3600) / 60);
  const seconds = Math.floor(appSeconds % 60);
  return `${dateStr}T${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}Z`;
};

/**
 * Formats the elapsed time between two ISO date strings as dd hh mm ss.
 */
export const ddhhmmssBetweenDateStrings = (date1: string, date2: string): string => {
  const diff = new Date(date2).getTime() - new Date(date1).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return `${days.toString().padStart(2, "0")}d ${(hours % 24)
    .toString()
    .padStart(2, "0")}h ${(minutes % 60).toString().padStart(2, "0")}m ${(seconds % 60)
    .toString()
    .padStart(2, "0")}s`;
};

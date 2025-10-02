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

export const appSecondsFromTimeStr = (timeStr: string): number => {
  const [hours, minutes, seconds] = timeStr.split(":").map((value) => Number.parseInt(value, 10));
  return hours * 3600 + minutes * 60 + seconds;
};

export const appSecondsFromDateTime = (dateTime?: string | null): number | null => {
  const timeComponent = timeComponentFromDateTime(dateTime);

  if (!timeComponent) {
    return null;
  }

  return appSecondsFromTimeStr(timeComponent);
};

export function hhmmssFromAppSeconds(appSeconds: number): string {
  const hours = Math.floor(appSeconds / 3600);
  const minutes = Math.floor((appSeconds % 3600) / 60);
  const seconds = Math.floor(appSeconds % 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

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
  return `${dateStr}T${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}Z`;
};

export const ddhhmmssBetweenDateStrings = (date1: string, date2: string): string => {
  const diff = new Date(date2).getTime() - new Date(date1).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
};

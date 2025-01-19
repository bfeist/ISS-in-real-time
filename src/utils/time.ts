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

export const appSecondsFromTimeStr = (timeStr: string): number => {
  const [hours, minutes, seconds] = timeStr.split(":").map((x) => parseInt(x));
  return hours * 3600 + minutes * 60 + seconds;
};

export function timeStrFromAppSeconds(appSeconds: number): string {
  const hours = Math.floor(appSeconds / 3600);
  const minutes = Math.floor((appSeconds % 3600) / 60);
  const seconds = Math.floor(appSeconds % 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

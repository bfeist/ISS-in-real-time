export const findClosestDate = (dateTime: Date, dates: Date[]): Date | undefined => {
  const sortedDates = dates.sort((a, b) => a.getTime() - b.getTime());
  const closestDate = sortedDates.reduce((closest, current) => {
    return Math.abs(current.getTime() - dateTime.getTime()) <
      Math.abs(closest.getTime() - dateTime.getTime())
      ? current
      : closest;
  }, sortedDates[0]);
  return closestDate;
};

export const timeStringFromTimeDef = (timeDef: TimeDef): string => {
  // milliseconds since timer was started
  const now = new Date().getTime();
  const diff = now - timeDef.startedTimestamp;

  // convert the start value to milliseconds
  const startParts = timeDef.startValue.split(":");
  const startMillis =
    parseInt(startParts[0]) * 60 * 60 * 1000 +
    parseInt(startParts[1]) * 60 * 1000 +
    parseInt(startParts[2]) * 1000;

  // calculate the new time
  const newTime = startMillis + diff;

  // convert the new time to hh:mm:ss
  const newHours = Math.floor(newTime / (60 * 60 * 1000));
  const newMinutes = Math.floor((newTime % (60 * 60 * 1000)) / (60 * 1000));
  const newSeconds = Math.floor((newTime % (60 * 1000)) / 1000);

  const newTimeStr = `${newHours.toString().padStart(2, "0")}:${newMinutes.toString().padStart(2, "0")}:${newSeconds.toString().padStart(2, "0")}`;
  return newTimeStr;
};

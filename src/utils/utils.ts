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

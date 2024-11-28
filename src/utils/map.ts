import { findClosestDate } from "./utils";

export const findClosestEphemeraItem = (
  dateTime: Date,
  ephemeraItems: EphemeraItem[]
): EphemeraItem | undefined => {
  const ephemeraDates = ephemeraItems.map((item) => new Date(item.epoch));
  const closestDate = findClosestDate(dateTime, ephemeraDates);
  if (!closestDate) {
    return undefined;
  }
  const closestEphemeraItem = ephemeraItems.find(
    (item) => new Date(item.epoch).getTime() === closestDate.getTime()
  );
  return closestEphemeraItem;
};

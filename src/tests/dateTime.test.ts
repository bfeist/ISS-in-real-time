import { describe, expect, it } from "vitest";
import {
  appSecondsFromDateTime,
  appSecondsFromTimeStr,
  dateTimeStrFromDateAppSeconds,
  ddhhmmssBetweenDateStrings,
  dateComponentFromDateTime,
  findClosestDate,
  getLastDateWithData,
  getNextDay,
  hhmmssFromAppSeconds,
  isSameDay,
  timeComponentFromDateTime,
} from "../utils/dateTime";

describe("date helpers", () => {
  it("identifies matching days", () => {
    const morning = new Date("2025-01-10T00:00:00Z");
    const evening = new Date("2025-01-10T23:59:59Z");
    const nextDay = new Date("2025-01-11T00:00:00Z");

    expect(isSameDay(morning, evening)).toBe(true);
    expect(isSameDay(morning, nextDay)).toBe(false);
    expect(isSameDay(null, evening)).toBe(false);
  });

  it("increments ISO dates", () => {
    expect(getNextDay("2025-02-27")).toBe("2025-02-28");
    expect(getNextDay("2020-02-28")).toBe("2020-02-29");
    expect(getNextDay("2020-12-31")).toBe("2021-01-01");
  });

  it("finds the last date with any availability", () => {
    const data: DataAvailability[] = [
      {
        date: "2025-01-01",
        comm: false,
        vvComm: false,
        video: false,
        eva: false,
        blog: false,
        actSum: false,
        earthPhotos: false,
        flickrPhotos: false,
        timeline: false,
      },
      {
        date: "2025-01-02",
        comm: true,
        vvComm: false,
        video: false,
        eva: false,
        blog: false,
        actSum: false,
        earthPhotos: false,
        flickrPhotos: false,
        timeline: false,
      },
    ];

    expect(getLastDateWithData(data)).toBe("2025-01-02");
    expect(getLastDateWithData([])).toBeNull();
    expect(getLastDateWithData(undefined)).toBeNull();
  });

  it("extracts date portion from ISO strings", () => {
    expect(dateComponentFromDateTime("2025-03-04T05:06:07Z")).toBe("2025-03-04");
    expect(dateComponentFromDateTime("2025-03-04 05:06:07")).toBe("2025-03-04 05:06:07");
    expect(dateComponentFromDateTime("   2025-03-04T05:06:07+02:00   ")).toBe("2025-03-04");
    expect(dateComponentFromDateTime("   ")).toBeNull();
    expect(dateComponentFromDateTime(null)).toBeNull();
  });

  it("finds closest date", () => {
    const origin = new Date("2025-01-10T12:00:00Z");
    const choices = [
      new Date("2025-01-09T12:00:00Z"),
      new Date("2025-01-10T10:00:00Z"),
      new Date("2025-01-11T12:00:00Z"),
    ];

    expect(findClosestDate(origin, choices)).toEqual(new Date("2025-01-10T10:00:00Z"));
    expect(findClosestDate(origin, [])).toBeUndefined();
  });
});

describe("time helpers", () => {
  it("extracts time components from ISO strings", () => {
    expect(timeComponentFromDateTime("2025-01-05T12:34:56Z")).toBe("12:34:56");
    expect(timeComponentFromDateTime("2025-01-05T12:34:56+02:00")).toBe("12:34:56");
    expect(timeComponentFromDateTime("2025-01-05T01:02:03.456Z")).toBe("01:02:03");
    expect(timeComponentFromDateTime("03:04:05")).toBe("03:04:05");
  });

  it("returns null when time is unavailable", () => {
    expect(timeComponentFromDateTime("2025-01-05")).toBeNull();
    expect(timeComponentFromDateTime(undefined)).toBeNull();
  });

  it("converts HH:mm:ss to seconds", () => {
    expect(appSecondsFromTimeStr("01:02:03")).toBe(3723);
  });

  it("extracts seconds from datetime", () => {
    expect(appSecondsFromDateTime("2025-01-05T01:02:03Z")).toBe(3723);
    expect(appSecondsFromDateTime("07:08:09")).toBe(25689);
    expect(appSecondsFromDateTime("2025-01-05")).toBeNull();
  });

  it("formats app seconds", () => {
    expect(hhmmssFromAppSeconds(0)).toBe("00:00:00");
    expect(hhmmssFromAppSeconds(3723)).toBe("01:02:03");
  });

  it("builds datetime strings from app seconds", () => {
    expect(dateTimeStrFromDateAppSeconds({ dateStr: "2025-01-05", appSeconds: 3723 })).toBe(
      "2025-01-05T01:02:03Z"
    );
  });

  it("formats intervals between dates", () => {
    expect(ddhhmmssBetweenDateStrings("2025-01-01T00:00:00Z", "2025-01-03T01:02:03Z")).toBe(
      "02d 01h 02m 03s"
    );
  });
});

import { describe, expect, it } from "vitest";
import { appSecondsFromDateTime, timeComponentFromDateTime } from "../utils/time";

describe("time utilities", () => {
  it("extracts time from ISO strings with timezone", () => {
    expect(timeComponentFromDateTime("2025-01-05T12:34:56Z")).toBe("12:34:56");
    expect(timeComponentFromDateTime("2025-01-05T12:34:56+02:00")).toBe("12:34:56");
  });

  it("normalizes fractional seconds and missing seconds", () => {
    expect(timeComponentFromDateTime("2025-01-05T01:02:03.456Z")).toBe("01:02:03");
    expect(timeComponentFromDateTime("2025-01-05T01:02")).toBe("01:02:00");
  });

  it("supports plain time strings", () => {
    expect(timeComponentFromDateTime("03:04:05")).toBe("03:04:05");
  });

  it("returns null when time is unavailable", () => {
    expect(timeComponentFromDateTime("2025-01-05")).toBeNull();
    expect(timeComponentFromDateTime(undefined)).toBeNull();
  });

  it("computes seconds from datetime when available", () => {
    expect(appSecondsFromDateTime("2025-01-05T01:02:03Z")).toBe(3723);
    expect(appSecondsFromDateTime("07:08:09")).toBe(25689);
  });

  it("returns null for datetimes without a time component", () => {
    expect(appSecondsFromDateTime("2025-01-05")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  parseDateTimeSlug,
  createDateTimeSlug,
  isValidDateString,
  isValidTimestring,
} from "../utils/params";

describe("Date Time Slug Utils", () => {
  describe("isValidDateString", () => {
    it("should validate correct date strings", () => {
      expect(isValidDateString("2023-12-25")).toBe(true);
      expect(isValidDateString("2020-02-29")).toBe(true); // leap year
    });

    it("should reject invalid date strings", () => {
      expect(isValidDateString("2023-13-25")).toBe(false); // invalid month
      expect(isValidDateString("2023-12-32")).toBe(false); // invalid day
      expect(isValidDateString("2021-02-29")).toBe(false); // not a leap year
      expect(isValidDateString("invalid")).toBe(false);
      expect(isValidDateString("")).toBe(false);
    });
  });

  describe("isValidTimestring", () => {
    it("should validate correct time strings", () => {
      expect(isValidTimestring("00:00:00")).toBe(true);
      expect(isValidTimestring("23:59:59")).toBe(true);
      expect(isValidTimestring("12:30:45")).toBe(true);
    });

    it("should reject invalid time strings", () => {
      expect(isValidTimestring("24:00:00")).toBe(false); // invalid hour
      expect(isValidTimestring("12:60:00")).toBe(false); // invalid minute
      expect(isValidTimestring("12:30:60")).toBe(false); // invalid second
      expect(isValidTimestring("12:30")).toBe(false); // missing seconds
      expect(isValidTimestring("")).toBe(false);
    });
  });

  describe("parseDateTimeSlug", () => {
    it("should parse valid slugs correctly with T separator", () => {
      const result = parseDateTimeSlug("2023-12-25T14:30:15");
      expect(result).toEqual({
        date: "2023-12-25",
        time: "14:30:15",
      });
    });

    it("should parse valid slugs correctly with / separator (URL decoded)", () => {
      const result = parseDateTimeSlug("2023-12-25/14:30:15");
      expect(result).toEqual({
        date: "2023-12-25",
        time: "14:30:15",
      });
    });

    it("should handle edge cases", () => {
      expect(parseDateTimeSlug("2020-02-29T00:00:00")).toEqual({
        date: "2020-02-29",
        time: "00:00:00",
      });

      expect(parseDateTimeSlug("2023-12-31/23:59:59")).toEqual({
        date: "2023-12-31",
        time: "23:59:59",
      });
    });

    it("should return null for invalid slugs", () => {
      expect(parseDateTimeSlug("")).toBe(null);
      expect(parseDateTimeSlug("invalid")).toBe(null);
      expect(parseDateTimeSlug("2023-12-25")).toBe(null); // missing time
      expect(parseDateTimeSlug("2023-12-25T24:00:00")).toBe(null); // invalid hour
      expect(parseDateTimeSlug("2023-13-25/12:00:00")).toBe(null); // invalid month
    });
  });

  describe("createDateTimeSlug", () => {
    it("should create valid slugs with T separator", () => {
      expect(createDateTimeSlug("2023-12-25", "14:30:15")).toBe("2023-12-25T14:30:15");
      expect(createDateTimeSlug("2020-02-29", "00:00:00")).toBe("2020-02-29T00:00:00");
    });

    it("should throw for invalid inputs", () => {
      expect(() => createDateTimeSlug("invalid", "14:30:15")).toThrow(
        "Invalid date or time format"
      );
      expect(() => createDateTimeSlug("2023-12-25", "25:00:00")).toThrow(
        "Invalid date or time format"
      );
    });
  });

  describe("round trip", () => {
    it("should maintain consistency between create and parse", () => {
      const originalDate = "2023-12-25";
      const originalTime = "14:30:15";

      const slug = createDateTimeSlug(originalDate, originalTime);
      const parsed = parseDateTimeSlug(slug);

      expect(parsed).toEqual({
        date: originalDate,
        time: originalTime,
      });
    });
  });
});

import { describe, expect, it } from "vitest";
import { inferEarthPhotoUrl, generateEarthPhotoUrls } from "../utils/earthPhotoUrls";

describe("Earth Photo URL utilities", () => {
  describe("inferEarthPhotoUrl", () => {
    it("generates correct large image URLs", () => {
      expect(inferEarthPhotoUrl("ISS056E126840", "large")).toBe(
        "https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS056/ISS056-E-126840.JPG"
      );

      expect(inferEarthPhotoUrl("ISS002E5408", "large")).toBe(
        "https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS002/ISS002-E-5408.JPG"
      );
    });

    it("generates correct medium image URLs", () => {
      expect(inferEarthPhotoUrl("ISS056E126840", "medium")).toBe(
        "https://eol.jsc.nasa.gov/DatabaseImages/ESC/small/ISS056/ISS056-E-126840.JPG"
      );

      expect(inferEarthPhotoUrl("ISS002E5408", "medium")).toBe(
        "https://eol.jsc.nasa.gov/DatabaseImages/ESC/small/ISS002/ISS002-E-5408.JPG"
      );
    });

    it("generates correct small (thumbnail) image URLs", () => {
      expect(inferEarthPhotoUrl("ISS056E126840", "small")).toBe(
        "https://eol.jsc.nasa.gov/DatabaseImages/thumb/ISS056/ISS056-E-126840.JPG"
      );

      expect(inferEarthPhotoUrl("ISS002E5408", "small")).toBe(
        "https://eol.jsc.nasa.gov/DatabaseImages/thumb/ISS002/ISS002-E-5408.JPG"
      );
    });

    it("handles different mission numbers correctly", () => {
      expect(inferEarthPhotoUrl("ISS001E1234", "large")).toBe(
        "https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS001/ISS001-E-1234.JPG"
      );

      expect(inferEarthPhotoUrl("ISS070A999999", "large")).toBe(
        "https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS070/ISS070-A-999999.JPG"
      );
    });

    it("handles different roll letters correctly", () => {
      expect(inferEarthPhotoUrl("ISS056A126840", "large")).toBe(
        "https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS056/ISS056-A-126840.JPG"
      );

      expect(inferEarthPhotoUrl("ISS056Z126840", "large")).toBe(
        "https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS056/ISS056-Z-126840.JPG"
      );
    });

    it("returns empty string for invalid photo ID formats", () => {
      expect(inferEarthPhotoUrl("INVALID", "large")).toBe("");
      expect(inferEarthPhotoUrl("ISS056", "large")).toBe("");
      expect(inferEarthPhotoUrl("056E126840", "large")).toBe("");
      expect(inferEarthPhotoUrl("ISS056E", "large")).toBe("");
      expect(inferEarthPhotoUrl("", "large")).toBe("");
    });
  });

  describe("generateEarthPhotoUrls", () => {
    it("generates all three URL sizes correctly", () => {
      const result = generateEarthPhotoUrls("ISS056E126840");

      expect(result).toEqual({
        smallUrl: "https://eol.jsc.nasa.gov/DatabaseImages/thumb/ISS056/ISS056-E-126840.JPG",
        medUrl: "https://eol.jsc.nasa.gov/DatabaseImages/ESC/small/ISS056/ISS056-E-126840.JPG",
        largeUrl: "https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS056/ISS056-E-126840.JPG",
      });
    });

    it("handles different photo IDs correctly", () => {
      const result = generateEarthPhotoUrls("ISS002E5408");

      expect(result).toEqual({
        smallUrl: "https://eol.jsc.nasa.gov/DatabaseImages/thumb/ISS002/ISS002-E-5408.JPG",
        medUrl: "https://eol.jsc.nasa.gov/DatabaseImages/ESC/small/ISS002/ISS002-E-5408.JPG",
        largeUrl: "https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS002/ISS002-E-5408.JPG",
      });
    });

    it("returns empty strings for invalid photo IDs", () => {
      const result = generateEarthPhotoUrls("INVALID");

      expect(result).toEqual({
        smallUrl: "",
        medUrl: "",
        largeUrl: "",
      });
    });
  });

  describe("URL format validation", () => {
    it("follows expected NASA EOL URL patterns", () => {
      const testCases = [
        {
          id: "ISS056E126840",
          expected: {
            large: "https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS056/ISS056-E-126840.JPG",
            medium: "https://eol.jsc.nasa.gov/DatabaseImages/ESC/small/ISS056/ISS056-E-126840.JPG",
            small: "https://eol.jsc.nasa.gov/DatabaseImages/thumb/ISS056/ISS056-E-126840.JPG",
          },
        },
        {
          id: "ISS002E5408",
          expected: {
            large: "https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS002/ISS002-E-5408.JPG",
            medium: "https://eol.jsc.nasa.gov/DatabaseImages/ESC/small/ISS002/ISS002-E-5408.JPG",
            small: "https://eol.jsc.nasa.gov/DatabaseImages/thumb/ISS002/ISS002-E-5408.JPG",
          },
        },
      ];

      testCases.forEach(({ id, expected }) => {
        const result = generateEarthPhotoUrls(id);
        expect(result.largeUrl).toBe(expected.large);
        expect(result.medUrl).toBe(expected.medium);
        expect(result.smallUrl).toBe(expected.small);
      });
    });
  });
});

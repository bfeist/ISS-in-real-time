import { describe, expect, it } from "vitest";
import {
  inferEarthPhotoUrl,
  generateEarthPhotoUrls,
  generateEarthPhotoSourceUrl,
  detectTimelapseSequences,
  markTimelapsePhotos,
} from "../utils/earthPhotos";

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

  describe("generateEarthPhotoSourceUrl", () => {
    it("generates correct ExplorePhotos URL for photos with coordinates", () => {
      expect(generateEarthPhotoSourceUrl("ISS056E126840", true)).toBe(
        "https://eol.jsc.nasa.gov/ExplorePhotos/?mrf=ISS056-E-126840&illum=day"
      );

      expect(generateEarthPhotoSourceUrl("ISS002E5408", true)).toBe(
        "https://eol.jsc.nasa.gov/ExplorePhotos/?mrf=ISS002-E-5408&illum=day"
      );

      expect(generateEarthPhotoSourceUrl("ISS070A999999", true)).toBe(
        "https://eol.jsc.nasa.gov/ExplorePhotos/?mrf=ISS070-A-999999&illum=day"
      );
    });

    it("returns empty string for photos without coordinates", () => {
      expect(generateEarthPhotoSourceUrl("ISS056E126840", false)).toBe("");
      expect(generateEarthPhotoSourceUrl("ISS002E5408", false)).toBe("");
    });

    it("returns empty string for invalid photo ID formats even with coordinates", () => {
      expect(generateEarthPhotoSourceUrl("INVALID", true)).toBe("");
      expect(generateEarthPhotoSourceUrl("ISS056", true)).toBe("");
      expect(generateEarthPhotoSourceUrl("056E126840", true)).toBe("");
      expect(generateEarthPhotoSourceUrl("ISS056E", true)).toBe("");
      expect(generateEarthPhotoSourceUrl("", true)).toBe("");
    });

    it("handles different roll letters correctly", () => {
      expect(generateEarthPhotoSourceUrl("ISS056A126840", true)).toBe(
        "https://eol.jsc.nasa.gov/ExplorePhotos/?mrf=ISS056-A-126840&illum=day"
      );

      expect(generateEarthPhotoSourceUrl("ISS056Z126840", true)).toBe(
        "https://eol.jsc.nasa.gov/ExplorePhotos/?mrf=ISS056-Z-126840&illum=day"
      );
    });

    it("always uses day illumination for better basemap visibility", () => {
      const url = generateEarthPhotoSourceUrl("ISS056E126840", true);
      expect(url).toContain("&illum=day");
      expect(url).not.toContain("&illum=night");
    });
  });

  describe("Timelapse detection", () => {
    // Helper function to create test photos with specific frame intervals
    const createTestPhotos = (
      frameIntervals: number[],
      startFrame = 126840,
      baseTime = "2023-01-01T12:00:00Z"
    ) => {
      const photos = [];
      const startTime = new Date(baseTime);
      let currentFrame = startFrame;

      for (let i = 0; i < frameIntervals.length; i++) {
        if (i > 0) {
          currentFrame += frameIntervals[i - 1];
        }
        // Add some time offset for realism, but frame number is what matters for detection
        const time = new Date(startTime.getTime() + i * 30000); // 30 seconds apart
        photos.push({
          dateTaken: time.toISOString(),
          nasaId: `ISS056E${currentFrame.toString()}`,
        });
      }

      return photos;
    };

    describe("detectTimelapseSequences", () => {
      it("returns empty set for photos below minimum sequence length", () => {
        const photos = createTestPhotos(Array(50).fill(1)); // 50 photos with +1 frame intervals
        const photoForDetection = photos.map((photo, index) => ({
          dateTaken: photo.dateTaken,
          nasaId: photo.nasaId,
          index,
        }));

        const result = detectTimelapseSequences(photoForDetection, 100);
        expect(result.size).toBe(0);
      });

      it("detects timelapse sequences with consistent frame intervals", () => {
        // Create 120 photos with consistent +1 frame intervals (sequential)
        const intervals = Array(120).fill(1); // Each photo is frame+1 from previous
        const photos = createTestPhotos(intervals);
        const photoForDetection = photos.map((photo, index) => ({
          dateTaken: photo.dateTaken,
          nasaId: photo.nasaId,
          index,
        }));

        const result = detectTimelapseSequences(photoForDetection, 100);
        expect(result.size).toBe(120);

        // All photos should be marked as timelapse
        for (let i = 0; i < 120; i++) {
          expect(result.has(i)).toBe(true);
        }
      });

      it("does not detect timelapse for irregular frame intervals", () => {
        // Create photos with irregular frame intervals (not consistent)
        const intervals = [5, 2, 10, 1, 3]; // 5 photos with irregular frame gaps
        const photos = createTestPhotos(intervals);
        const photoForDetection = photos.map((photo, index) => ({
          dateTaken: photo.dateTaken,
          nasaId: photo.nasaId,
          index,
        }));

        const result = detectTimelapseSequences(photoForDetection, 5);
        expect(result.size).toBe(0);
      });

      it("separates timelapse and non-timelapse sequences correctly", () => {
        const photos = [];

        // Add some irregular photos (non-timelapse)
        photos.push({ dateTaken: "2023-01-01T10:00:00Z", nasaId: "ISS056E126840" });
        photos.push({ dateTaken: "2023-01-01T10:05:00Z", nasaId: "ISS056E126841" }); // 5 min gap
        photos.push({ dateTaken: "2023-01-01T10:07:00Z", nasaId: "ISS056E126842" }); // 2 min gap

        // Add timelapse sequence: 110 photos with 30-second intervals
        const baseTime = new Date("2023-01-01T12:00:00Z");
        for (let i = 0; i < 110; i++) {
          const time = new Date(baseTime.getTime() + i * 30000); // 30 seconds apart
          photos.push({
            dateTaken: time.toISOString(),
            nasaId: `ISS056E${(126850 + i).toString()}`,
          });
        }

        // Add more irregular photos after timelapse
        photos.push({ dateTaken: "2023-01-01T14:00:00Z", nasaId: "ISS056E127000" });
        photos.push({ dateTaken: "2023-01-01T14:10:00Z", nasaId: "ISS056E127001" });

        const photoForDetection = photos.map((photo, index) => ({
          dateTaken: photo.dateTaken,
          nasaId: photo.nasaId,
          index,
        }));

        const result = detectTimelapseSequences(photoForDetection, 100);

        // Should detect 110 timelapse photos (indices 3-112)
        expect(result.size).toBe(110);

        // First 3 photos should not be timelapse
        expect(result.has(0)).toBe(false);
        expect(result.has(1)).toBe(false);
        expect(result.has(2)).toBe(false);

        // Photos 3-112 should be timelapse
        for (let i = 3; i <= 112; i++) {
          expect(result.has(i)).toBe(true);
        }

        // Last 2 photos should not be timelapse
        expect(result.has(113)).toBe(false);
        expect(result.has(114)).toBe(false);
      });

      it("handles photos in non-chronological order", () => {
        // Create photos with consistent frame intervals but shuffle them
        const intervals = Array(105).fill(1); // Sequential frame numbers
        const photos = createTestPhotos(intervals);

        // Shuffle the photos array
        const shuffledPhotos = [...photos];
        for (let i = shuffledPhotos.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledPhotos[i], shuffledPhotos[j]] = [shuffledPhotos[j], shuffledPhotos[i]];
        }

        const photoForDetection = shuffledPhotos.map((photo, index) => ({
          dateTaken: photo.dateTaken,
          nasaId: photo.nasaId,
          index,
        }));

        const result = detectTimelapseSequences(photoForDetection, 100);

        // Should still detect the timelapse sequence despite shuffling
        expect(result.size).toBe(105);
      });
    });

    describe("markTimelapsePhotos", () => {
      it("adds isTimelapse property to all photos", () => {
        const photos = createTestPhotos([30000, 60000, 45000]); // 3 photos with irregular intervals

        const result = markTimelapsePhotos(photos, 100);

        expect(result).toHaveLength(3);
        result.forEach((photo) => {
          expect(photo).toHaveProperty("isTimelapse");
          expect(typeof photo.isTimelapse).toBe("boolean");
          expect(photo.isTimelapse).toBe(false); // Not enough photos for timelapse
        });
      });

      it("correctly marks timelapse photos", () => {
        // Create 120 photos with consistent frame intervals
        const intervals = Array(120).fill(1); // Sequential frames
        const photos = createTestPhotos(intervals);

        const result = markTimelapsePhotos(photos, 100);

        expect(result).toHaveLength(120);
        result.forEach((photo) => {
          expect(photo.isTimelapse).toBe(true);
        });
      });

      it("preserves original photo properties", () => {
        const photos = [
          {
            dateTaken: "2023-01-01T12:00:00Z",
            nasaId: "ISS056E126840",
            description: "Test photo",
            sourceUrl: "https://example.com",
          },
        ];

        const result = markTimelapsePhotos(photos, 100);

        expect(result[0]).toEqual({
          dateTaken: "2023-01-01T12:00:00Z",
          nasaId: "ISS056E126840",
          description: "Test photo",
          sourceUrl: "https://example.com",
          isTimelapse: false,
        });
      });

      it("handles mixed sequences correctly", () => {
        const photos = [];

        // Non-timelapse photos
        photos.push({ dateTaken: "2023-01-01T10:00:00Z", nasaId: "ISS056E001" });
        photos.push({ dateTaken: "2023-01-01T10:05:00Z", nasaId: "ISS056E002" });

        // Timelapse sequence: 110 photos with 30-second intervals
        const baseTime = new Date("2023-01-01T12:00:00Z");
        for (let i = 0; i < 110; i++) {
          const time = new Date(baseTime.getTime() + i * 30000);
          photos.push({
            dateTaken: time.toISOString(),
            nasaId: `ISS056E${(100 + i).toString()}`,
          });
        }

        // More non-timelapse photos
        photos.push({ dateTaken: "2023-01-01T14:00:00Z", nasaId: "ISS056E999" });

        const result = markTimelapsePhotos(photos, 100);

        // Check first two photos are not timelapse
        expect(result[0].isTimelapse).toBe(false);
        expect(result[1].isTimelapse).toBe(false);

        // Check timelapse photos (indices 2-111)
        for (let i = 2; i <= 111; i++) {
          expect(result[i].isTimelapse).toBe(true);
        }

        // Check last photo is not timelapse
        expect(result[112].isTimelapse).toBe(false);
      });

      it("respects custom minimum sequence length", () => {
        // Create 50 photos with consistent frame intervals
        const intervals = Array(50).fill(1); // Sequential frames
        const photos = createTestPhotos(intervals);

        // With default minimum (100), should not be timelapse
        const result1 = markTimelapsePhotos(photos);
        result1.forEach((photo) => {
          expect(photo.isTimelapse).toBe(false);
        });

        // With custom minimum (40), should be timelapse
        const result2 = markTimelapsePhotos(photos, 40);
        result2.forEach((photo) => {
          expect(photo.isTimelapse).toBe(true);
        });
      });

      it("handles overlapping sequences from different missions correctly", () => {
        const photos = [];

        // ISS056 mission: 110 photos with sequential frame numbers
        const iss056BaseTime = new Date("2023-01-01T12:00:00Z");
        for (let i = 0; i < 110; i++) {
          const time = new Date(iss056BaseTime.getTime() + i * 30000);
          photos.push({
            dateTaken: time.toISOString(),
            nasaId: `ISS056E${(126000 + i).toString()}`, // Sequential frames 126000-126109
          });
        }

        // ISS057 mission: 105 photos with sequential frame numbers, overlapping in time
        const iss057BaseTime = new Date("2023-01-01T12:05:00Z"); // Start 5 minutes later
        for (let i = 0; i < 105; i++) {
          const time = new Date(iss057BaseTime.getTime() + i * 25000);
          photos.push({
            dateTaken: time.toISOString(),
            nasaId: `ISS057E${(127000 + i).toString()}`, // Sequential frames 127000-127104
          });
        }

        const result = markTimelapsePhotos(photos, 100);

        // Count ISS056 and ISS057 timelapse photos separately
        const iss056TimelapseCount = result.filter(
          (photo) => photo.nasaId.startsWith("ISS056") && photo.isTimelapse
        ).length;
        const iss057TimelapseCount = result.filter(
          (photo) => photo.nasaId.startsWith("ISS057") && photo.isTimelapse
        ).length;

        // Both missions should be detected as separate timelapse sequences
        expect(iss056TimelapseCount).toBe(110);
        expect(iss057TimelapseCount).toBe(105);

        // Total timelapse photos should be the sum of both missions
        const totalTimelapseCount = result.filter((photo) => photo.isTimelapse).length;
        expect(totalTimelapseCount).toBe(215);
      });

      it("detects timelapse based on frame sequence even with irregular timestamps", () => {
        const photos = [];

        // Create 110 photos with sequential frame numbers but irregular timestamps
        // This simulates different cameras or processing delays affecting timestamp accuracy
        const irregularTimes = [
          "2023-01-01T12:00:00Z",
          "2023-01-01T12:00:25Z", // 25 seconds later
          "2023-01-01T12:01:10Z", // 45 seconds later
          "2023-01-01T12:01:35Z", // 25 seconds later
          "2023-01-01T12:02:00Z", // 25 seconds later
        ];

        for (let i = 0; i < 110; i++) {
          // Use irregular timestamps that don't show a pattern
          const timeIndex = i % irregularTimes.length;
          const baseTime = new Date(irregularTimes[timeIndex]);
          const time = new Date(baseTime.getTime() + Math.floor(i / irregularTimes.length) * 60000);

          photos.push({
            dateTaken: time.toISOString(),
            nasaId: `ISS056E${(126000 + i).toString()}`, // Sequential frame numbers
          });
        }

        const result = markTimelapsePhotos(photos, 100);

        // Should detect timelapse based on sequential frame numbers despite irregular timestamps
        const timelapseCount = result.filter((photo) => photo.isTimelapse).length;
        expect(timelapseCount).toBe(110);
      });
    });
  });
});

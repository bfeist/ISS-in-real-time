import { describe, expect, it } from "vitest";
import {
  calculateWindowIndices,
  shouldExpandWindowStart,
  shouldExpandWindowEnd,
  isWindowValid,
  isOutsideWindow,
  findClosestPhotoByTime,
  findClosestPhotoBeforeOrAtTime,
  shouldResetWindow,
  findPhotoIndex,
  calculateExpandedWindowStart,
  calculateExpandedWindowEnd,
  photosToPhotoWithSeconds,
} from "../utils/photoThumbs";

// Test helper to create mock photos
function createMockPhoto(
  nasaId: string,
  dateTaken: string,
  type: "photos_earth" | "photos_flickr" = "photos_earth"
): PhotoItem {
  return {
    nasaId,
    dateTaken,
    smallUrl: `small-${nasaId}.jpg`,
    medUrl: `med-${nasaId}.jpg`,
    largeUrl: `large-${nasaId}.jpg`,
    type,
  } as PhotoItem;
}

describe("calculateWindowIndices", () => {
  it("creates a centered window of 41 photos (20 before, 1 center, 20 after)", () => {
    const result = calculateWindowIndices(100, 50);
    expect(result).toEqual({ start: 30, end: 71 });
    expect(result!.end - result!.start).toBe(41);
  });

  it("handles center photo near start of array", () => {
    const result = calculateWindowIndices(100, 5);
    expect(result).toEqual({ start: 0, end: 26 });
    // Window is smaller because we hit the start boundary
    expect(result!.end - result!.start).toBe(26);
  });

  it("handles center photo near end of array", () => {
    const result = calculateWindowIndices(100, 95);
    expect(result).toEqual({ start: 75, end: 100 });
    // Window is smaller because we hit the end boundary
    expect(result!.end - result!.start).toBe(25);
  });

  it("handles center photo at start of array", () => {
    const result = calculateWindowIndices(100, 0);
    expect(result).toEqual({ start: 0, end: 21 });
  });

  it("handles center photo at end of array", () => {
    const result = calculateWindowIndices(100, 99);
    expect(result).toEqual({ start: 79, end: 100 });
  });

  it("handles small arrays (less than window size)", () => {
    const result = calculateWindowIndices(10, 5);
    expect(result).toEqual({ start: 0, end: 10 });
  });

  it("returns null for empty array", () => {
    const result = calculateWindowIndices(0, 0);
    expect(result).toBeNull();
  });

  it("returns null for out of bounds index (negative)", () => {
    const result = calculateWindowIndices(100, -1);
    expect(result).toBeNull();
  });

  it("returns null for out of bounds index (too large)", () => {
    const result = calculateWindowIndices(100, 100);
    expect(result).toBeNull();
  });

  it("respects custom window radius", () => {
    const result = calculateWindowIndices(100, 50, 10);
    expect(result).toEqual({ start: 40, end: 61 });
    expect(result!.end - result!.start).toBe(21); // 10 before + 1 center + 10 after
  });
});

describe("shouldExpandWindowStart", () => {
  it("returns true when target is within buffer threshold of window start", () => {
    expect(shouldExpandWindowStart(23, 20, 5)).toBe(true); // 3 photos from start
    expect(shouldExpandWindowStart(24, 20, 5)).toBe(true); // 4 photos from start
    expect(shouldExpandWindowStart(21, 20, 5)).toBe(true); // 1 photo from start
  });

  it("returns false when target is beyond buffer threshold", () => {
    expect(shouldExpandWindowStart(26, 20, 5)).toBe(false); // 6 photos from start
    expect(shouldExpandWindowStart(30, 20, 5)).toBe(false);
  });

  it("returns false when already at start of array", () => {
    expect(shouldExpandWindowStart(2, 0, 5)).toBe(false);
  });

  it("respects custom buffer threshold", () => {
    expect(shouldExpandWindowStart(12, 10, 3)).toBe(true); // 2 photos from start
    expect(shouldExpandWindowStart(14, 10, 3)).toBe(false); // 4 photos from start
  });
});

describe("shouldExpandWindowEnd", () => {
  it("returns true when target is within buffer threshold of window end", () => {
    expect(shouldExpandWindowEnd(77, 80, 100, 5)).toBe(true); // 3 photos from end
    expect(shouldExpandWindowEnd(76, 80, 100, 5)).toBe(true); // 4 photos from end
  });

  it("returns false when target is beyond buffer threshold", () => {
    expect(shouldExpandWindowEnd(74, 80, 100, 5)).toBe(false); // 6 photos from end
    expect(shouldExpandWindowEnd(70, 80, 100, 5)).toBe(false);
  });

  it("returns false when already at end of array", () => {
    expect(shouldExpandWindowEnd(97, 99, 100, 5)).toBe(false);
  });

  it("respects custom buffer threshold", () => {
    expect(shouldExpandWindowEnd(78, 80, 100, 3)).toBe(true); // 2 photos from end (80-78=2 < 3)
    expect(shouldExpandWindowEnd(76, 80, 100, 3)).toBe(false); // 4 photos from end (80-76=4 >= 3)
  });
});

describe("isWindowValid", () => {
  const allPhotos = [
    createMockPhoto("photo1", "2025-01-01T10:00:00Z"),
    createMockPhoto("photo2", "2025-01-01T11:00:00Z"),
    createMockPhoto("photo3", "2025-01-01T12:00:00Z"),
    createMockPhoto("photo4", "2025-01-01T13:00:00Z"),
  ];

  it("returns true when all windowed photos exist in main array", () => {
    const windowedPhotos = [allPhotos[1], allPhotos[2]];
    expect(isWindowValid(windowedPhotos, allPhotos)).toBe(true);
  });

  it("returns false when a windowed photo does not exist in main array", () => {
    const windowedPhotos = [allPhotos[1], createMockPhoto("photo5", "2025-01-01T14:00:00Z")];
    expect(isWindowValid(windowedPhotos, allPhotos)).toBe(false);
  });

  it("returns false for empty window", () => {
    expect(isWindowValid([], allPhotos)).toBe(false);
  });

  it("returns true when window contains all photos in order", () => {
    expect(isWindowValid(allPhotos, allPhotos)).toBe(true);
  });
});

describe("isOutsideWindow", () => {
  it("returns true when target is before window start", () => {
    expect(isOutsideWindow(15, 20, 40)).toBe(true);
  });

  it("returns true when target is after window end", () => {
    expect(isOutsideWindow(45, 20, 40)).toBe(true);
  });

  it("returns false when target is within window", () => {
    expect(isOutsideWindow(25, 20, 40)).toBe(false);
    expect(isOutsideWindow(30, 20, 40)).toBe(false);
    expect(isOutsideWindow(35, 20, 40)).toBe(false);
  });

  it("returns false when target is at window boundaries", () => {
    expect(isOutsideWindow(20, 20, 40)).toBe(false); // at start
    expect(isOutsideWindow(40, 20, 40)).toBe(false); // at end
  });
});

describe("photosToPhotoWithSeconds", () => {
  it("converts photos with valid timestamps", () => {
    const photos = [
      createMockPhoto("photo1", "2025-01-01T10:30:45Z"), // 37845 seconds
      createMockPhoto("photo2", "2025-01-01T11:00:00Z"), // 39600 seconds
    ];
    const result = photosToPhotoWithSeconds(photos);
    expect(result).toHaveLength(2);
    expect(result[0].seconds).toBe(37845);
    expect(result[1].seconds).toBe(39600);
  });

  it("filters out photos with invalid timestamps", () => {
    const photos = [
      createMockPhoto("photo1", "2025-01-01T10:00:00Z"),
      createMockPhoto("photo2", "2025-01-01"), // No time component
      createMockPhoto("photo3", "2025-01-01T11:00:00Z"),
    ];
    const result = photosToPhotoWithSeconds(photos);
    expect(result).toHaveLength(2);
    expect(result[0].photo.nasaId).toBe("photo1");
    expect(result[1].photo.nasaId).toBe("photo3");
  });

  it("returns empty array for empty input", () => {
    expect(photosToPhotoWithSeconds([])).toEqual([]);
  });
});

describe("findClosestPhotoByTime", () => {
  const photos = [
    createMockPhoto("photo1", "2025-01-01T10:00:00Z"), // 36000 seconds
    createMockPhoto("photo2", "2025-01-01T10:05:00Z"), // 36300 seconds
    createMockPhoto("photo3", "2025-01-01T10:05:00Z"), // 36300 seconds (duplicate time)
    createMockPhoto("photo4", "2025-01-01T10:10:00Z"), // 36600 seconds
    createMockPhoto("photo5", "2025-01-01T10:15:00Z"), // 36900 seconds
  ];

  it("finds exact match when available", () => {
    const result = findClosestPhotoByTime(photos, 36600);
    expect(result?.nasaId).toBe("photo4");
  });

  it("returns first photo when multiple photos exist at exact time", () => {
    const result = findClosestPhotoByTime(photos, 36300);
    expect(result?.nasaId).toBe("photo2");
  });

  it("prefers clicked photo when multiple photos exist at exact time", () => {
    const result = findClosestPhotoByTime(photos, 36300, "photo3");
    expect(result?.nasaId).toBe("photo3");
  });

  it("finds closest photo when no exact match (before first photo)", () => {
    const result = findClosestPhotoByTime(photos, 35900); // 100 seconds before first
    expect(result?.nasaId).toBe("photo1");
  });

  it("finds closest photo when no exact match (between photos)", () => {
    const result = findClosestPhotoByTime(photos, 36450); // halfway between photo3 and photo4
    // photo2 and photo3 are at 36300, photo4 is at 36600
    // 36450 is 150s from both photo3 (36300) and photo4 (36600)
    // Function iterates through all and finds minimum diff, returns first match
    expect(["photo2", "photo3", "photo4"]).toContain(result?.nasaId);
  });

  it("finds closest photo when no exact match (after last photo)", () => {
    const result = findClosestPhotoByTime(photos, 37000); // 100 seconds after last
    expect(result?.nasaId).toBe("photo5");
  });

  it("returns null for empty array", () => {
    expect(findClosestPhotoByTime([], 36000)).toBeNull();
  });

  it("returns null when all photos lack valid timestamps", () => {
    const invalidPhotos = [
      createMockPhoto("photo1", "2025-01-01"),
      createMockPhoto("photo2", "2025-01-02"),
    ];
    expect(findClosestPhotoByTime(invalidPhotos, 36000)).toBeNull();
  });

  it("finds closest among photos with valid timestamps, ignoring invalid ones", () => {
    const mixedPhotos = [
      createMockPhoto("photo1", "2025-01-01T10:00:00Z"), // 36000 seconds
      createMockPhoto("photo2", "2025-01-01"), // Invalid
      createMockPhoto("photo3", "2025-01-01T10:10:00Z"), // 36600 seconds
    ];
    const result = findClosestPhotoByTime(mixedPhotos, 36300);
    expect(["photo1", "photo3"]).toContain(result?.nasaId);
  });
});

describe("findClosestPhotoBeforeOrAtTime", () => {
  const photos = [
    createMockPhoto("photo1", "2025-01-01T10:00:00Z"), // 36000 seconds
    createMockPhoto("photo2", "2025-01-01T10:05:00Z"), // 36300 seconds
    createMockPhoto("photo3", "2025-01-01T10:05:00Z"), // 36300 seconds (duplicate time)
    createMockPhoto("photo4", "2025-01-01T10:10:00Z"), // 36600 seconds
    createMockPhoto("photo5", "2025-01-01T10:15:00Z"), // 36900 seconds
  ];

  it("finds exact match when available", () => {
    const result = findClosestPhotoBeforeOrAtTime(photos, 36600);
    expect(result?.nasaId).toBe("photo4");
  });

  it("returns first photo when multiple photos exist at exact time", () => {
    const result = findClosestPhotoBeforeOrAtTime(photos, 36300);
    expect(result?.nasaId).toBe("photo2");
  });

  it("prefers clicked photo when multiple photos exist at exact time", () => {
    const result = findClosestPhotoBeforeOrAtTime(photos, 36300, "photo3");
    expect(result?.nasaId).toBe("photo3");
  });

  it("finds closest photo before target time (not after)", () => {
    const result = findClosestPhotoBeforeOrAtTime(photos, 36450); // between photo3 and photo4
    expect(result?.nasaId).toBe("photo3"); // Should choose photo3, not photo4
  });

  it("returns null when target is before first photo", () => {
    const result = findClosestPhotoBeforeOrAtTime(photos, 35900);
    // Function only considers photos at or before target time, so returns null
    expect(result).toBeNull();
  });

  it("returns first photo when target is slightly after first photo", () => {
    const result = findClosestPhotoBeforeOrAtTime(photos, 36100);
    expect(result?.nasaId).toBe("photo1"); // photo1 is at 36000
  });

  it("finds last photo when target is after all photos", () => {
    const result = findClosestPhotoBeforeOrAtTime(photos, 37000);
    expect(result?.nasaId).toBe("photo5");
  });

  it("returns null for empty array", () => {
    expect(findClosestPhotoBeforeOrAtTime([], 36000)).toBeNull();
  });
});

describe("shouldResetWindow", () => {
  it("returns true when window exceeds max size", () => {
    expect(shouldResetWindow(201, 200)).toBe(true);
    expect(shouldResetWindow(250, 200)).toBe(true);
  });

  it("returns false when window is at or below max size", () => {
    expect(shouldResetWindow(200, 200)).toBe(false);
    expect(shouldResetWindow(150, 200)).toBe(false);
    expect(shouldResetWindow(1, 200)).toBe(false);
  });

  it("uses default max size of 200", () => {
    expect(shouldResetWindow(201)).toBe(true);
    expect(shouldResetWindow(200)).toBe(false);
  });

  it("respects custom max window size", () => {
    expect(shouldResetWindow(101, 100)).toBe(true);
    expect(shouldResetWindow(100, 100)).toBe(false);
  });
});

describe("findPhotoIndex", () => {
  const photos = [
    createMockPhoto("photo1", "2025-01-01T10:00:00Z"),
    createMockPhoto("photo2", "2025-01-01T11:00:00Z"),
    createMockPhoto("photo3", "2025-01-01T12:00:00Z"),
  ];

  it("finds photo index by nasaId", () => {
    expect(findPhotoIndex(photos, "photo1")).toBe(0);
    expect(findPhotoIndex(photos, "photo2")).toBe(1);
    expect(findPhotoIndex(photos, "photo3")).toBe(2);
  });

  it("returns -1 when photo not found", () => {
    expect(findPhotoIndex(photos, "photo4")).toBe(-1);
    expect(findPhotoIndex(photos, "nonexistent")).toBe(-1);
  });

  it("returns -1 for empty array", () => {
    expect(findPhotoIndex([], "photo1")).toBe(-1);
  });
});

describe("calculateExpandedWindowStart", () => {
  it("expands window backward by expansion size", () => {
    expect(calculateExpandedWindowStart(50, 20)).toBe(30);
    expect(calculateExpandedWindowStart(100, 20)).toBe(80);
  });

  it("does not expand below zero", () => {
    expect(calculateExpandedWindowStart(10, 20)).toBe(0);
    expect(calculateExpandedWindowStart(0, 20)).toBe(0);
  });

  it("respects custom expansion size", () => {
    expect(calculateExpandedWindowStart(50, 10)).toBe(40);
    expect(calculateExpandedWindowStart(50, 30)).toBe(20);
  });
});

describe("calculateExpandedWindowEnd", () => {
  it("expands window forward by expansion size plus one", () => {
    expect(calculateExpandedWindowEnd(50, 100, 20)).toBe(71); // 50 + 20 + 1
    expect(calculateExpandedWindowEnd(30, 100, 20)).toBe(51); // 30 + 20 + 1
  });

  it("does not expand beyond array length", () => {
    expect(calculateExpandedWindowEnd(90, 100, 20)).toBe(100);
    expect(calculateExpandedWindowEnd(99, 100, 20)).toBe(100);
  });

  it("respects custom expansion size", () => {
    expect(calculateExpandedWindowEnd(50, 100, 10)).toBe(61); // 50 + 10 + 1
    expect(calculateExpandedWindowEnd(50, 100, 30)).toBe(81); // 50 + 30 + 1
  });

  it("handles edge case where expansion would exactly reach end", () => {
    expect(calculateExpandedWindowEnd(79, 100, 20)).toBe(100); // 79 + 20 + 1 = 100
  });
});

describe("edge cases and integration scenarios", () => {
  it("handles single photo array", () => {
    const singlePhoto = [createMockPhoto("photo1", "2025-01-01T10:00:00Z")];
    const windowIndices = calculateWindowIndices(1, 0);
    expect(windowIndices).toEqual({ start: 0, end: 1 });

    const closest = findClosestPhotoByTime(singlePhoto, 36000);
    expect(closest?.nasaId).toBe("photo1");

    expect(shouldExpandWindowStart(0, 0)).toBe(false);
    expect(shouldExpandWindowEnd(0, 0, 1)).toBe(false);
  });

  it("handles window management for very large arrays", () => {
    const largeArrayLength = 10000;
    const centerIndex = 5000;

    const windowIndices = calculateWindowIndices(largeArrayLength, centerIndex);
    expect(windowIndices).toEqual({ start: 4980, end: 5021 });
    expect(windowIndices!.end - windowIndices!.start).toBe(41);

    // 4985 - 4980 = 5, which is NOT less than buffer threshold of 5 (needs to be < 5)
    expect(shouldExpandWindowStart(4984, 4980)).toBe(true); // 4 photos from start
    expect(shouldExpandWindowEnd(5016, 5020, largeArrayLength)).toBe(true); // 4 photos from end
  });

  it("handles photos with identical timestamps", () => {
    const photos = [
      createMockPhoto("photo1", "2025-01-01T10:00:00Z"),
      createMockPhoto("photo2", "2025-01-01T10:00:00Z"),
      createMockPhoto("photo3", "2025-01-01T10:00:00Z"),
    ];

    const result = findClosestPhotoByTime(photos, 36000);
    expect(result?.nasaId).toBe("photo1");

    const resultWithClick = findClosestPhotoByTime(photos, 36000, "photo3");
    expect(resultWithClick?.nasaId).toBe("photo3");
  });

  it("validates window operations maintain consistency", () => {
    const photosLength = 100;
    const centerIndex = 50;

    // Initial window
    const initial = calculateWindowIndices(photosLength, centerIndex)!;
    expect(initial).toEqual({ start: 30, end: 71 });

    // Expand start
    const expandedStart = calculateExpandedWindowStart(initial.start);
    expect(expandedStart).toBe(10);

    // Expand end
    const expandedEnd = calculateExpandedWindowEnd(initial.end - 1, photosLength);
    expect(expandedEnd).toBe(91);

    // Combined expansion creates window of 10 to 91 (81 photos)
    const newWindowSize = expandedEnd - expandedStart;
    expect(shouldResetWindow(newWindowSize, 200)).toBe(false);
  });
});

/**
 * Infers Earth photography URLs from NASA EOL photo IDs
 *
 * @param nasaId - The photo ID (e.g., "ISS056E126840")
 * @param size - The image size: "small", "medium", or "large"
 * @returns The complete URL for the specified image size
 */
export function inferEarthPhotoUrl(nasaId: string, size: "small" | "medium" | "large"): string {
  const baseUrl = "https://eol.jsc.nasa.gov/DatabaseImages";

  // Convert ID format from ISS056E126840 to ISS056/ISS056-E-126840.JPG
  const match = nasaId.match(/^(ISS\d+)([A-Z])(\d+)$/);

  if (!match) {
    return "";
  }

  const [, mission, roll, frame] = match;
  const filename = `${mission}-${roll}-${frame}.JPG`;

  // Map sizes to their respective directories
  const sizeMap = {
    large: "ESC/large",
    medium: "ESC/small", // Medium uses small directory
    small: "thumb",
  };

  const directory = sizeMap[size];

  // For thumb directory, include mission subdirectory
  if (size === "small") {
    return `${baseUrl}/${directory}/${mission}/${filename}`;
  }

  // For ESC directories, include mission subdirectory
  return `${baseUrl}/${directory}/${mission}/${filename}`;
}

/**
 * Generates all three URL sizes for a NASA ID
 *
 * @param nasaId - The NASA ID (e.g., "ISS056E126840")
 * @returns Object containing smallUrl, medUrl, and largeUrl
 */
export function generateEarthPhotoUrls(nasaId: string): {
  smallUrl: string;
  medUrl: string;
  largeUrl: string;
} {
  return {
    smallUrl: inferEarthPhotoUrl(nasaId, "small"),
    medUrl: inferEarthPhotoUrl(nasaId, "medium"),
    largeUrl: inferEarthPhotoUrl(nasaId, "large"),
  };
}

/**
 * Generates the NASA Earth Observations ExplorePhotos URL for a given photo
 * Only photos in the MLCoord table (those with lat/lon coordinates) will have valid links
 *
 * @param nasaId - The NASA ID (e.g., "ISS056E126840")
 * @param hasCoordinates - Whether the photo has lat/lon coordinates (is in MLCoord table)
 * @returns The ExplorePhotos URL, or empty string if photo doesn't have coordinates or invalid nasaId
 */
export function generateEarthPhotoSourceUrl(nasaId: string, hasCoordinates: boolean): string {
  if (!hasCoordinates) {
    return "";
  }

  // Parse the NASA ID format: ISS056E126840 -> mission: ISS056, roll: E, frame: 126840
  const match = nasaId.match(/^(ISS\d+)([A-Z])(\d+)$/);

  if (!match) {
    return "";
  }

  const [, mission, roll, frame] = match;

  // Build the URL with mission-roll-frame format and day illumination
  // Using "day" for illumination as it provides better basemap visibility
  return `https://eol.jsc.nasa.gov/ExplorePhotos/?mrf=${mission}-${roll}-${frame}&illum=day`;
}

/**
 * Interface for photo items used in timelapse detection
 */
interface PhotoForTimelapse {
  dateTaken: string;
  index: number;
  nasaId: string;
}

/**
 * Extracts mission identifier from NASA ID
 * @param nasaId - NASA ID like "ISS056E126840"
 * @returns Mission key like "ISS056" or the full nasaId if parsing fails
 */
function getMissionKey(nasaId: string): string {
  const match = nasaId.match(/^(ISS\d+)([A-Z])(\d+)$/);
  if (!match) {
    // If we can't parse it, treat each photo as its own mission to be safe
    return nasaId;
  }
  const [, mission] = match;
  return mission;
}

/**
 * Extracts frame number from NASA ID for sorting
 * @param nasaId - NASA ID like "ISS056E126840"
 * @returns Frame number as integer or 0 if parsing fails
 */
function getFrameNumber(nasaId: string): number {
  const match = nasaId.match(/^(ISS\d+)([A-Z])(\d+)$/);
  if (!match) {
    return 0;
  }
  const [, , , frame] = match;
  return parseInt(frame, 10);
}

/**
 * Detects timelapse sequences within a single mission's photos
 * Sorts by frame number to detect sequential timelapse captures
 */
function detectTimelapseSequencesForCamera(
  photos: PhotoForTimelapse[],
  minSequenceLength: number = 100
): Set<number> {
  if (photos.length < minSequenceLength) {
    return new Set();
  }

  // Sort photos by frame number to detect sequential captures
  const sortedPhotos = [...photos].sort((a, b) => {
    const frameA = getFrameNumber(a.nasaId);
    const frameB = getFrameNumber(b.nasaId);
    return frameA - frameB;
  });

  const timelapseIndices = new Set<number>();

  // Calculate frame number differences between consecutive photos
  const frameDiffs: number[] = [];
  for (let i = 1; i < sortedPhotos.length; i++) {
    const prevFrame = getFrameNumber(sortedPhotos[i - 1].nasaId);
    const currentFrame = getFrameNumber(sortedPhotos[i].nasaId);
    frameDiffs.push(currentFrame - prevFrame);
  }

  if (frameDiffs.length === 0) {
    return new Set();
  }

  // Calculate changes in frame intervals (active gaps)
  const activeGaps: number[] = [];
  for (let i = 1; i < frameDiffs.length; i++) {
    activeGaps.push(Math.abs(frameDiffs[i] - frameDiffs[i - 1]));
  }

  // Group photos by consistent frame intervals
  // A new group starts when the change in frame interval is significant (> 1 frame difference)
  let currentGroupStart = 0;
  const groups: { start: number; end: number }[] = [];

  for (let i = 0; i < activeGaps.length; i++) {
    if (activeGaps[i] > 1) {
      // Frame interval change threshold
      // End current group
      if (i + 1 - currentGroupStart >= minSequenceLength - 1) {
        groups.push({
          start: currentGroupStart,
          end: i + 1,
        });
      }
      currentGroupStart = i + 1;
    }
  }

  // Handle the last group
  if (sortedPhotos.length - currentGroupStart >= minSequenceLength) {
    groups.push({
      start: currentGroupStart,
      end: sortedPhotos.length - 1,
    });
  }

  // Add indices of photos in timelapse groups to the result set
  for (const group of groups) {
    for (let i = group.start; i <= group.end; i++) {
      timelapseIndices.add(sortedPhotos[i].index);
    }
  }

  return timelapseIndices;
}

/**
 * Detects timelapse sequences in a collection of photos based on consistent time intervals
 * Groups by mission first to handle multiple simultaneous missions/sessions
 *
 * @param photos - Array of photos with dateTaken timestamps and nasaId
 * @param minSequenceLength - Minimum number of photos to consider a timelapse (default: 100)
 * @returns Set of indices that are part of timelapse sequences
 */
export function detectTimelapseSequences(
  photos: PhotoForTimelapse[],
  minSequenceLength: number = 100
): Set<number> {
  if (photos.length < minSequenceLength) {
    return new Set();
  }

  const allTimelapseIndices = new Set<number>();

  // Group photos by mission (ISS056, ISS057, etc.)
  const photosByMission = new Map<string, PhotoForTimelapse[]>();

  for (const photo of photos) {
    const missionKey = getMissionKey(photo.nasaId);
    if (!photosByMission.has(missionKey)) {
      photosByMission.set(missionKey, []);
    }
    photosByMission.get(missionKey)!.push(photo);
  }

  // Detect timelapse sequences within each mission
  for (const missionPhotos of photosByMission.values()) {
    const missionTimelapseIndices = detectTimelapseSequencesForCamera(
      missionPhotos,
      minSequenceLength
    );

    // Add all detected indices to the global set
    for (const index of missionTimelapseIndices) {
      allTimelapseIndices.add(index);
    }
  }

  return allTimelapseIndices;
}

/**
 * Marks photos as timelapse based on detection algorithm
 *
 * @param photos - Array of photos with dateTaken timestamps and nasaId
 * @param minSequenceLength - Minimum number of photos to consider a timelapse (default: 100)
 * @returns Array of photos with isTimelapse property added
 */
export function markTimelapsePhotos<T extends { dateTaken: string; nasaId: string }>(
  photos: T[],
  minSequenceLength: number = 100
): (T & { isTimelapse: boolean })[] {
  const photoForDetection: PhotoForTimelapse[] = photos.map((photo, index) => ({
    dateTaken: photo.dateTaken,
    nasaId: photo.nasaId,
    index,
  }));

  const timelapseIndices = detectTimelapseSequences(photoForDetection, minSequenceLength);

  return photos.map((photo, index) => ({
    ...photo,
    isTimelapse: timelapseIndices.has(index),
  }));
}

import { appSecondsFromDateTime } from "./time";

export interface PhotoRectangleBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface CurrentAndAdjacentPhotos {
  currentPhotoWithCorners: PhotoItemEarth | null;
  prevPhoto: PhotoItemEarth | null;
  nextPhoto: PhotoItemEarth | null;
}

/**
 * Calculate rectangle bounds from photo corners
 */
export function calculateRectangleBounds(
  corners: PhotoItemEarth["corners"]
): PhotoRectangleBounds | null {
  if (!corners) return null;

  const west = Math.min(corners.ul.lon, corners.ll.lon);
  const south = Math.min(corners.ll.lat, corners.lr.lat);
  const east = Math.max(corners.ur.lon, corners.lr.lon);
  const north = Math.max(corners.ul.lat, corners.ur.lat);

  return { west, south, east, north };
}

/**
 * Validate if rectangle bounds are valid and renderable
 */
export function isValidRectangle(bounds: PhotoRectangleBounds): boolean {
  const { west, south, east, north } = bounds;

  // Check if coordinates are within valid ranges
  if (west < -180 || west > 180 || east < -180 || east > 180) return false;
  if (south < -90 || south > 90 || north < -90 || north > 90) return false;

  // Check if rectangle is valid (east > west, north > south)
  if (east <= west || north <= south) return false;

  // Check if rectangle is too large (likely crosses date line or is invalid)
  if (east - west > 10 || north - south > 10) return false;

  return true;
}

/**
 * Get current photo and adjacent photos (prev/next) based on app seconds
 */
export function getCurrentAndAdjacentPhotos(
  appSeconds: number,
  earthPhotographyItems: PhotoItemEarth[],
  showEarthPhotos: boolean,
  showTimelapsePhotos: boolean
): CurrentAndAdjacentPhotos {
  if (!Number.isFinite(appSeconds) || earthPhotographyItems.length === 0) {
    return { currentPhotoWithCorners: null, prevPhoto: null, nextPhoto: null };
  }

  // Filter photos based on toggle state
  let visibleEarthPhotos: PhotoItemEarth[] = [];
  if (showEarthPhotos && showTimelapsePhotos) {
    visibleEarthPhotos = earthPhotographyItems;
  } else if (showEarthPhotos && !showTimelapsePhotos) {
    visibleEarthPhotos = earthPhotographyItems.filter((photo) => !photo.isTimelapse);
  } else if (!showEarthPhotos && showTimelapsePhotos) {
    visibleEarthPhotos = earthPhotographyItems.filter((photo) => photo.isTimelapse);
  }

  // Find photos at current time or closest before
  const photoEntries = visibleEarthPhotos
    .map((photo) => {
      const photoSeconds = appSecondsFromDateTime(photo.dateTaken);
      if (photoSeconds === null) return null;
      return { photo, photoSeconds };
    })
    .filter((entry): entry is { photo: PhotoItemEarth; photoSeconds: number } => entry !== null)
    .sort((a, b) => a.photoSeconds - b.photoSeconds);

  if (photoEntries.length === 0) {
    return { currentPhotoWithCorners: null, prevPhoto: null, nextPhoto: null };
  }

  // Find the most recent photo at or before current time
  let currentIndex = -1;
  for (let i = 0; i < photoEntries.length; i++) {
    if (photoEntries[i].photoSeconds > appSeconds) break;
    currentIndex = i;
  }

  const currentPhoto =
    currentIndex >= 0 && photoEntries[currentIndex].photo.corners
      ? photoEntries[currentIndex].photo
      : null;

  const prev =
    currentIndex > 0 && photoEntries[currentIndex - 1].photo.corners
      ? photoEntries[currentIndex - 1].photo
      : null;

  const next =
    currentIndex >= 0 &&
    currentIndex < photoEntries.length - 1 &&
    photoEntries[currentIndex + 1].photo.corners
      ? photoEntries[currentIndex + 1].photo
      : null;

  return { currentPhotoWithCorners: currentPhoto, prevPhoto: prev, nextPhoto: next };
}

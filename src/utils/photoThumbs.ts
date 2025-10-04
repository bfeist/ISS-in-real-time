/**
 * Pure utility functions for photo thumbnail window management and selection.
 * Extracted from photosThumbs component for testability.
 */

import { appSecondsFromDateTime } from "./time";

export interface WindowIndices {
  start: number;
  end: number;
}

export interface PhotoWithSeconds {
  photo: PhotoItem;
  seconds: number;
}

/**
 * Calculate window indices centered around a target photo.
 * Returns a window of approximately 41 photos (20 before, target, 20 after).
 * Adjusts at array boundaries to maintain window size when possible.
 */
export function calculateWindowIndices(
  photosLength: number,
  centerIndex: number,
  windowRadius: number = 20
): WindowIndices | null {
  if (photosLength === 0 || centerIndex < 0 || centerIndex >= photosLength) {
    return null;
  }

  const start = Math.max(0, centerIndex - windowRadius);
  const end = Math.min(photosLength, centerIndex + windowRadius + 1);

  return { start, end };
}

/**
 * Determine if window should expand at the start based on scroll position.
 */
export function shouldExpandWindowStart(
  targetIndex: number,
  windowStartIndex: number,
  bufferThreshold: number = 5
): boolean {
  if (windowStartIndex <= 0) {
    return false;
  }

  return targetIndex - windowStartIndex < bufferThreshold;
}

/**
 * Determine if window should expand at the end based on scroll position.
 */
export function shouldExpandWindowEnd(
  targetIndex: number,
  windowEndIndex: number,
  photosLength: number,
  bufferThreshold: number = 5
): boolean {
  if (windowEndIndex >= photosLength - 1) {
    return false;
  }

  return windowEndIndex - targetIndex < bufferThreshold;
}

/**
 * Check if a window of photos is still valid (all photos exist in the main array).
 */
export function isWindowValid(windowedPhotos: PhotoItem[], allPhotos: PhotoItem[]): boolean {
  if (windowedPhotos.length === 0) {
    return false;
  }

  return windowedPhotos.every((photo) => allPhotos.some((p) => p.nasaId === photo.nasaId));
}

/**
 * Check if a target photo is outside the current window range.
 */
export function isOutsideWindow(
  targetIndex: number,
  windowStartIndex: number,
  windowEndIndex: number
): boolean {
  return targetIndex < windowStartIndex || targetIndex > windowEndIndex;
}

/**
 * Convert array of photos to array with computed seconds for efficient lookups.
 */
export function photosToPhotoWithSeconds(photos: PhotoItem[]): PhotoWithSeconds[] {
  return photos
    .map((photo) => {
      const seconds = appSecondsFromDateTime(photo.dateTaken);
      if (seconds === null) {
        return null;
      }
      return { photo, seconds };
    })
    .filter((entry): entry is PhotoWithSeconds => entry !== null);
}

/**
 * Find the closest photo to a target time in seconds.
 * If multiple photos exist at the exact target time and a clickedId is provided,
 * prefer that photo. Otherwise, return the first photo at that time.
 * If no exact match, return the closest photo before the target time.
 */
export function findClosestPhotoByTime(
  photos: PhotoItem[],
  targetSeconds: number,
  clickedPhotoId?: string | null
): PhotoItem | null {
  if (photos.length === 0) {
    return null;
  }

  const photosWithSeconds = photosToPhotoWithSeconds(photos);

  if (photosWithSeconds.length === 0) {
    return null;
  }

  // Find all photos at the exact target time
  const photosAtTargetTime = photosWithSeconds.filter(({ seconds }) => seconds === targetSeconds);

  if (photosAtTargetTime.length > 0) {
    // If we have a clicked photo preference, try to find it
    if (clickedPhotoId) {
      const clickedPhoto = photosAtTargetTime.find(({ photo }) => photo.nasaId === clickedPhotoId);
      if (clickedPhoto) {
        return clickedPhoto.photo;
      }
    }
    // Otherwise return the first photo at this time
    return photosAtTargetTime[0].photo;
  }

  // No exact match - find closest photo
  let closestPhoto: PhotoItem | null = null;
  let smallestDiff: number | null = null;

  for (const { photo, seconds } of photosWithSeconds) {
    const diff = Math.abs(targetSeconds - seconds);

    if (smallestDiff === null || diff < smallestDiff) {
      smallestDiff = diff;
      closestPhoto = photo;
    }
  }

  return closestPhoto;
}

/**
 * Find the closest photo that is at or before the target time.
 * This variant prefers photos before the target time (useful for timeline scrubbing).
 */
export function findClosestPhotoBeforeOrAtTime(
  photos: PhotoItem[],
  targetSeconds: number,
  clickedPhotoId?: string | null
): PhotoItem | null {
  if (photos.length === 0) {
    return null;
  }

  const photosWithSeconds = photosToPhotoWithSeconds(photos);

  if (photosWithSeconds.length === 0) {
    return null;
  }

  // Find all photos at the exact target time
  const photosAtTargetTime = photosWithSeconds.filter(({ seconds }) => seconds === targetSeconds);

  if (photosAtTargetTime.length > 0) {
    // If we have a clicked photo preference, try to find it
    if (clickedPhotoId) {
      const clickedPhoto = photosAtTargetTime.find(({ photo }) => photo.nasaId === clickedPhotoId);
      if (clickedPhoto) {
        return clickedPhoto.photo;
      }
    }
    // Otherwise return the first photo at this time
    return photosAtTargetTime[0].photo;
  }

  // No exact match - find closest photo at or before target time
  let closestPhoto: PhotoItem | null = null;
  let smallestDiff: number | null = null;

  for (const { photo, seconds } of photosWithSeconds) {
    if (seconds > targetSeconds) {
      break; // Stop when we've passed the target time
    }

    const diff = Math.abs(targetSeconds - seconds);

    if (smallestDiff === null || diff <= smallestDiff) {
      smallestDiff = diff;
      closestPhoto = photo;
    }
  }

  return closestPhoto;
}

/**
 * Check if current window size exceeds the maximum allowed size.
 */
export function shouldResetWindow(currentWindowSize: number, maxWindowSize: number = 200): boolean {
  return currentWindowSize > maxWindowSize;
}

/**
 * Find the index of a photo in an array by its nasaId.
 */
export function findPhotoIndex(photos: PhotoItem[], nasaId: string): number {
  return photos.findIndex((photo) => photo.nasaId === nasaId);
}

/**
 * Calculate new window start index when expanding backward.
 */
export function calculateExpandedWindowStart(
  currentStartIndex: number,
  expansionSize: number = 20
): number {
  return Math.max(0, currentStartIndex - expansionSize);
}

/**
 * Calculate new window end index when expanding forward.
 */
export function calculateExpandedWindowEnd(
  currentEndIndex: number,
  photosLength: number,
  expansionSize: number = 20
): number {
  return Math.min(photosLength, currentEndIndex + expansionSize + 1);
}

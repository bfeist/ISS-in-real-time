/**
 * ISS Orbit Number Calculator
 *
 * Calculates the current ISS orbit number for any given date and time
 * based on the daily orbit counts and real-time TLE mean motion data.
 *
 * Similar to the Python script 7a_web_orbit_count.py but for real-time calculations.
 */

import { findClosestEphemeraItem } from "./map";
import { hhmmssFromAppSeconds } from "./time";

/**
 * Parse TLE line 2 to extract mean motion (orbits per day)
 * Mean motion is located in columns 53-63 of TLE line 2
 */
export function extractMeanMotionFromTle(tleLine2: string): number {
  if (!tleLine2 || tleLine2.length < 63) {
    return 15.54; // Fallback to average ISS mean motion
  }

  try {
    const meanMotionStr = tleLine2.substring(52, 63).trim();
    const meanMotion = parseFloat(meanMotionStr);

    if (isNaN(meanMotion) || meanMotion <= 0) {
      return 15.54;
    }

    return meanMotion;
  } catch (error) {
    console.warn("Failed to extract mean motion from TLE:", error);
    return 15.54;
  }
}

/**
 * Calculate the current ISS orbit number for a given date and app seconds
 *
 * @param selectedDate - Date string in YYYY-MM-DD format
 * @param appSeconds - Seconds since 00:00:00 UTC on the selected date
 * @param ephemeraItems - Array of TLE data for the date
 * @param orbitsDaily - Daily orbit counts object (date -> orbit count at start of day)
 * @returns Current orbit number (integer)
 */
export function calculateCurrentOrbitNumber(
  selectedDate: string,
  appSeconds: number,
  ephemeraItems: EphemeraItem[],
  orbitsDaily: OrbitDaily
): number {
  // Get the starting orbit count for this date
  const baseOrbitCount = orbitsDaily[selectedDate];

  if (!baseOrbitCount || !ephemeraItems?.length || !selectedDate) {
    return 0; // Return 0 if no data available
  }

  // Create the current timestamp for TLE lookup
  const currentDateTime = new Date(`${selectedDate}T${hhmmssFromAppSeconds(appSeconds)}Z`);

  // Find the closest TLE entry to get accurate mean motion
  const closestEphemera = findClosestEphemeraItem(currentDateTime, ephemeraItems);

  if (!closestEphemera?.tle_line2) {
    // If no TLE data, just return the base orbit count
    return Math.round(baseOrbitCount);
  }

  // Extract mean motion (orbits per day) from TLE
  const meanMotion = extractMeanMotionFromTle(closestEphemera.tle_line2);

  // Calculate fractional day progress (0.0 to 1.0)
  const secondsInDay = 24 * 60 * 60;
  const dayProgress = appSeconds / secondsInDay;

  // Calculate additional orbits completed since start of day
  const additionalOrbits = meanMotion * dayProgress;

  // Add to base count and round to nearest whole orbit
  const currentOrbitNumber = baseOrbitCount + additionalOrbits;

  return Math.round(currentOrbitNumber);
}

/**
 * Get orbit number display string with proper formatting
 *
 * @param orbitNumber - The orbit number to format
 * @returns Formatted string (e.g., "123,456")
 */
export function formatOrbitNumber(orbitNumber: number): string {
  if (orbitNumber === 0) {
    return "N/A";
  }

  return orbitNumber.toLocaleString();
}

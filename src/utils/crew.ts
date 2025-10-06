/**
 * Crew name utilities
 *
 * IMPORTANT: Crew names in the data come from Wikipedia scraping and may have variations:
 * - Different middle initial formats: "Frank L. Culbertson Jr." vs "Frank Culbertson"
 * - Nickname variations: "Doug" vs "Douglas", "Suni" vs "Sunita"
 * - Transliteration differences: "Sergey" vs "Sergei", "Yuri" vs "Yury"
 *
 * The Python script (6_web_crew_arrive_dep_from_flights.py) uses fuzzy matching to
 * link arrival/departure events, but preserves the original name format from each flight.
 * This means the SAME PERSON may have different name formats across multiple stays.
 *
 * For matching crew members across stays (e.g., in highlightCrew), use getCrewNormalizedName().
 */

/**
 * Get the full display name for a crew member.
 * Includes all name components: first, middle, last, and suffix.
 *
 * @param crew - The crew member item
 * @returns Full name string (e.g., "Frank L. Culbertson Jr.")
 */
export const getCrewFullName = (crew: CrewArrDepItem): string => {
  const parts: string[] = [];

  if (crew.name_first) parts.push(crew.name_first);
  if (crew.name_middle) parts.push(crew.name_middle);
  if (crew.name_last) parts.push(crew.name_last);

  const baseName = parts.join(" ").trim();

  if (crew.name_suffix) {
    // Add suffix with proper formatting
    return `${baseName} ${crew.name_suffix}`;
  }

  return baseName;
};

/**
 * Get a normalized name for crew member matching.
 * Uses only first and last name to match across different name format variations.
 * This matches the normalization logic in the Python script.
 *
 * @param crew - The crew member item
 * @returns Normalized name string (e.g., "Frank Culbertson")
 */
export const getCrewNormalizedName = (crew: CrewArrDepItem): string => {
  const parts: string[] = [];

  if (crew.name_first) parts.push(crew.name_first);
  if (crew.name_last) parts.push(crew.name_last);

  return parts.join(" ").trim();
};

/**
 * Get a unique key for a crew member's stay.
 * Combines arrival date and normalized name to create a unique identifier.
 *
 * @param crew - The crew member item
 * @returns Unique key string
 */
export const getCrewStayKey = (crew: CrewArrDepItem): string => {
  return `${crew.arrivalDate}_${getCrewNormalizedName(crew)}`;
};

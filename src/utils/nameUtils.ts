/**
 * Cleans crew member names by removing middle initials, suffixes, and nicknames
 * @param {string} name - The original name to clean
 * @returns {string} - The cleaned name
 */
function cleanCrewName(name: string | null): string | null {
  if (!name || typeof name !== "string") {
    return name;
  }

  let cleaned = name.trim();

  // Remove nicknames in quotes (e.g., "Suni")
  cleaned = cleaned.replace(/\s*"[^"]*"\s*/g, " ");

  // Remove suffixes like Jr., Sr., III, etc.
  cleaned = cleaned.replace(/,?\s+(Jr\.?|Sr\.?|III|IV|V)\.?\s*$/i, "");

  // Split into words and filter out middle initials
  const words = cleaned.split(/\s+/).filter((word) => word.length > 0);
  const filteredWords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Keep first name (first word)
    if (i === 0) {
      filteredWords.push(word);
    }
    // Keep last name (last word)
    else if (i === words.length - 1) {
      filteredWords.push(word);
    }
    // Skip middle initials (single letter with optional period)
    else if (!/^[A-Z]\.?$/.test(word)) {
      // Keep middle names that are more than just initials
      filteredWords.push(word);
    }
  }

  return filteredWords.join(" ");
}
export { cleanCrewName };

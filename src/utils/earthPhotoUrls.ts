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
    console.warn(`Invalid NASA ID format: ${nasaId}`);
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

/**
 * Infers Earth photography URLs from NASA EOL photo IDs
 *
 * @param photoId - The photo ID (e.g., "ISS056E126840")
 * @param size - The image size: "small", "medium", or "large"
 * @returns The complete URL for the specified image size
 */
export function inferEarthPhotoUrl(photoId: string, size: "small" | "medium" | "large"): string {
  const baseUrl = "https://eol.jsc.nasa.gov/DatabaseImages";

  // Convert ID format from ISS056E126840 to ISS056/ISS056-E-126840.JPG
  const match = photoId.match(/^(ISS\d+)([A-Z])(\d+)$/);

  if (!match) {
    console.warn(`Invalid photo ID format: ${photoId}`);
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
 * Generates all three URL sizes for a photo ID
 *
 * @param photoId - The photo ID (e.g., "ISS056E126840")
 * @returns Object containing smallUrl, medUrl, and largeUrl
 */
export function generateEarthPhotoUrls(photoId: string): {
  smallUrl: string;
  medUrl: string;
  largeUrl: string;
} {
  return {
    smallUrl: inferEarthPhotoUrl(photoId, "small"),
    medUrl: inferEarthPhotoUrl(photoId, "medium"),
    largeUrl: inferEarthPhotoUrl(photoId, "large"),
  };
}

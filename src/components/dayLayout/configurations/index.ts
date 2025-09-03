import { videoLayouts } from "./layoutVideo";
import { commLayouts } from "./layoutComm";
import { noCommLayouts } from "./layoutNoComm";

// Combine all layout configurations
const allLayouts = {
  ...videoLayouts,
  ...commLayouts,
  ...noCommLayouts,
};

/**
 * Convert DataAvailability to boolean flags for layout resolution
 */
function normalizeDataAvailability(dataAvailability: DataAvailability | undefined) {
  return {
    video: dataAvailability?.youtube || false,
    comm: dataAvailability?.comm || dataAvailability?.vvComm || false,
    eva: dataAvailability?.eva || false,
    article: dataAvailability?.blog || dataAvailability?.activitySummary || false,
    photo: dataAvailability?.earthPhotography || false,
  };
}

/**
 * Generate a layout key from boolean conditions
 */
function generateLayoutKey(conditions: {
  video: boolean;
  comm: boolean;
  eva: boolean;
  article: boolean;
  photo: boolean;
}) {
  const parts = [];
  if (conditions.video) parts.push("video");
  if (conditions.comm) parts.push("comm");
  if (conditions.eva) parts.push("eva");
  if (conditions.article) parts.push("article");
  if (conditions.photo) parts.push("photo");

  return parts.length > 0 ? parts.join("-") : "none";
}

/**
 * Resolve the appropriate layout configuration based on data availability
 */
export function resolveLayout(dataAvailability: DataAvailability | undefined): LayoutConfiguration {
  const conditions = normalizeDataAvailability(dataAvailability);
  const layoutKey = generateLayoutKey(conditions);

  const layout = allLayouts[layoutKey];

  if (!layout) {
    console.warn(`No layout found for key: ${layoutKey}`, conditions);
    // Return default fallback layout
    return noCommLayouts.none;
  }

  return layout;
}

/**
 * Get all available layout configurations (useful for testing/debugging)
 */
export function getAllLayouts(): Record<string, LayoutConfiguration> {
  return allLayouts;
}

/**
 * Get layout keys by category (useful for debugging)
 */
export function getLayoutsByCategory(): Record<string, string[]> {
  return {
    video: Object.keys(videoLayouts),
    comm: Object.keys(commLayouts),
    noComm: Object.keys(noCommLayouts),
  };
}

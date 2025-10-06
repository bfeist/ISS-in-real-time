import ReactGA from "react-ga4";

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || "G-CJX45LP3HE";

/**
 * Initialize Google Analytics
 * Should be called once when the app starts
 */
export const initGA = (): void => {
  // Only initialize in production or if explicitly enabled
  const isDevelopment = import.meta.env.DEV;

  if (isDevelopment && !import.meta.env.VITE_GA_DEBUG) {
    console.log("Google Analytics disabled in development mode");
    return;
  }

  try {
    ReactGA.initialize(MEASUREMENT_ID, {
      gtagOptions: {
        // Respect Do Not Track browser setting
        anonymize_ip: true,
        // Additional privacy settings
        allow_ad_personalization_signals: false,
      },
    });

    console.log("Google Analytics initialized with ID:", MEASUREMENT_ID);
  } catch (error) {
    console.error("Failed to initialize Google Analytics:", error);
  }
};

/**
 * Track page view
 * Call this on route changes
 */
export const trackPageView = (path: string, title?: string): void => {
  try {
    ReactGA.send({
      hitType: "pageview",
      page: path,
      title: title || document.title,
    });
  } catch (error) {
    console.error("Failed to track page view:", error);
  }
};

/**
 * Track custom events
 * @param category - Event category (e.g., 'User', 'Navigation')
 * @param action - Event action (e.g., 'Click', 'View')
 * @param label - Optional label for additional context
 * @param value - Optional numeric value
 */
export const trackEvent = (
  category: string,
  action: string,
  label?: string,
  value?: number
): void => {
  try {
    ReactGA.event({
      category,
      action,
      label,
      value,
    });
  } catch (error) {
    console.error("Failed to track event:", error);
  }
};

/**
 * Track outbound link clicks
 */
export const trackOutboundLink = (url: string, label?: string): void => {
  trackEvent("Outbound Link", "Click", label || url);
};

/**
 * Track timeline interactions
 */
export const trackTimelineInteraction = (action: string, label?: string): void => {
  trackEvent("Timeline", action, label);
};

/**
 * Track media interactions
 */
export const trackMediaInteraction = (mediaType: string, action: string, label?: string): void => {
  trackEvent(`Media - ${mediaType}`, action, label);
};

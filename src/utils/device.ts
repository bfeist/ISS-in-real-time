/**
 * Device detection utilities
 */

// Extend Navigator interface for legacy IE/Edge support
interface ExtendedNavigator extends Navigator {
  msMaxTouchPoints?: number;
}

/**
 * Detects if the current device supports touch input
 * Uses multiple detection methods for better accuracy
 */
export const isTouchDevice = (): boolean => {
  // Check for touch event support
  if (typeof window === "undefined") {
    return false;
  }

  // Method 1: Check for ontouchstart property
  if ("ontouchstart" in window) {
    return true;
  }

  // Method 2: Check for TouchEvent constructor
  if (window.TouchEvent) {
    return true;
  }

  // Method 3: Check navigator.maxTouchPoints (modern method)
  if (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) {
    return true;
  }

  // Method 4: Check for touch in msMaxTouchPoints (IE/Edge)
  const extendedNavigator = navigator as ExtendedNavigator;
  if (extendedNavigator.msMaxTouchPoints && extendedNavigator.msMaxTouchPoints > 0) {
    return true;
  }

  // Method 5: Check media query for hover capability (devices without hover are usually touch)
  if (window.matchMedia && window.matchMedia("(hover: none)").matches) {
    return true;
  }

  return false;
};

/**
 * Detects if the device is likely a mobile device based on screen size and touch support
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  // Combine touch detection with screen size heuristics
  const hasSmallScreen = window.innerWidth <= 768 || window.innerHeight <= 768;
  const hasTouch = isTouchDevice();

  // Mobile if it has touch AND small screen, OR if it has touch and no hover capability
  return (
    (hasTouch && hasSmallScreen) ||
    (hasTouch && window.matchMedia && window.matchMedia("(hover: none)").matches)
  );
};

/**
 * Detects if the current browser is Safari running on iOS.
 * iOS Safari applies system-level momentum scrolling that can override programmatic scroll adjustments.
 */
export const isIosSafari = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || navigator.vendor || "";
  const isIOS = /iP(ad|hone|od)/.test(userAgent);

  if (!isIOS) {
    return false;
  }

  const isWebKit = /WebKit/i.test(userAgent);
  const isChromeIOS = /CriOS/i.test(userAgent);
  const isFirefoxIOS = /FxiOS/i.test(userAgent);

  return isIOS && isWebKit && !isChromeIOS && !isFirefoxIOS;
};

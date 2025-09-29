import { describe, it, expect } from "vitest";
import { isTouchDevice, isMobileDevice } from "../utils/device";

describe("Device Detection Utils", () => {
  describe("isTouchDevice", () => {
    it("should return false when window is undefined", () => {
      // @ts-ignore - Intentionally setting window to undefined for testing
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      expect(isTouchDevice()).toBe(false);

      // Restore window
      global.window = originalWindow;
    });

    it("should be a function that returns a boolean", () => {
      expect(typeof isTouchDevice).toBe("function");
      expect(typeof isTouchDevice()).toBe("boolean");
    });
  });

  describe("isMobileDevice", () => {
    it("should return false when window is undefined", () => {
      // @ts-ignore - Intentionally setting window to undefined for testing
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      expect(isMobileDevice()).toBe(false);

      // Restore window
      global.window = originalWindow;
    });

    it("should be a function that returns a boolean", () => {
      expect(typeof isMobileDevice).toBe("function");
      expect(typeof isMobileDevice()).toBe("boolean");
    });
  });
});

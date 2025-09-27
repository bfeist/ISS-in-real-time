import { expect } from "vitest";
import "@testing-library/jest-dom";

/**
 * Custom matchers for the vitest testing framework.
 * Migrated from jest-extends.ts
 */

// Compare clock times
expect.extend({
  toHappenAround(x: Date, y: Date, z: string) {
    const received = x.getTime();
    const expected = y.getTime();
    return {
      pass: Math.abs(received / 1000 - expected / 1000) < 1,
      message: () => `Received time ${x} is not within 1 second of ${y}${z ? ` ${z}` : ""}`,
    };
  },
});

// Mock globals that were in jest config
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

if (typeof window.IntersectionObserver === "undefined") {
  class IntersectionObserverMock implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [];

    constructor() {}

    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: IntersectionObserverMock,
  });

  Object.defineProperty(globalThis, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: IntersectionObserverMock,
  });
}

export {};

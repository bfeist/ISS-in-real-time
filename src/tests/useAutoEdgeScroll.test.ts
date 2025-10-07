import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoEdgeScroll } from "../components/timelineYears/hooks/useAutoEdgeScroll";

const createContainer = () => {
  const element = {
    getBoundingClientRect: () =>
      ({
        left: 0,
        right: 400,
        top: 0,
        bottom: 100,
        width: 400,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  } as unknown as HTMLDivElement;
  Object.defineProperty(element, "scrollWidth", {
    value: 2000,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(element, "clientWidth", {
    value: 400,
    writable: true,
    configurable: true,
  });
  let scrollLeftValue = 800;
  let scrollLeftUpdateCount = 0;
  Object.defineProperty(element, "scrollLeft", {
    configurable: true,
    get: () => scrollLeftValue,
    set: (value: number) => {
      scrollLeftValue = value;
      scrollLeftUpdateCount += 1;
    },
  });
  return {
    element,
    getScrollLeft: () => scrollLeftValue,
    getScrollLeftUpdateCount: () => scrollLeftUpdateCount,
  };
};

describe("useAutoEdgeScroll", () => {
  let originalInnerWidth: number;
  let requestAnimationFrameSpy: ReturnType<typeof vi.fn>;
  let cancelAnimationFrameSpy: ReturnType<typeof vi.fn>;
  let callbacks: FrameRequestCallback[];
  let nextFrameId: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });

    callbacks = [];
    nextFrameId = 1;

    requestAnimationFrameSpy = vi.fn((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return nextFrameId++;
    });

    cancelAnimationFrameSpy = vi.fn();

    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameSpy);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, configurable: true });
  });

  const flushNextAnimationFrame = (timestamp: number) => {
    const callback = callbacks.shift();
    if (callback) {
      callback(timestamp);
    }
  };

  it("starts scrolling when pointer stays within the edge zone", () => {
    const { element, getScrollLeft, getScrollLeftUpdateCount } = createContainer();
    const containerRef = { current: element } as RefObject<HTMLDivElement>;
    const initialScrollLeft = getScrollLeft();

    const { result } = renderHook(() => useAutoEdgeScroll(containerRef, { isEnabled: true }));

    act(() => {
      result.current.updateFromPointer(5, true);
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);

    act(() => {
      flushNextAnimationFrame(0);
      flushNextAnimationFrame(16);
      flushNextAnimationFrame(32);
    });
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(4);

    expect(getScrollLeftUpdateCount()).toBeGreaterThan(0);
    expect(getScrollLeft()).toBeLessThan(initialScrollLeft);
  });

  it("stops scrolling when pointer leaves the edge zone", () => {
    const { element } = createContainer();
    const containerRef = { current: element } as RefObject<HTMLDivElement>;

    const { result } = renderHook(() => useAutoEdgeScroll(containerRef, { isEnabled: true }));

    act(() => {
      result.current.updateFromPointer(5, true);
    });

    act(() => {
      flushNextAnimationFrame(0);
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.updateFromPointer(200, true);
    });

    expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(1);
  });

  it("cancels any pending animation frame on unmount", () => {
    const { element } = createContainer();
    const containerRef = { current: element } as RefObject<HTMLDivElement>;

    const { result, unmount } = renderHook(() =>
      useAutoEdgeScroll(containerRef, { isEnabled: true })
    );

    act(() => {
      result.current.updateFromPointer(5, true);
    });

    act(() => {
      flushNextAnimationFrame(0);
    });

    unmount();

    expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(1);
  });
});

import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMegaOverlayState } from "../components/timelineYears/hooks/useMegaOverlayState";

const createContainerRef = () => {
  const container = document.createElement("div");
  Object.defineProperty(container, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        left: 0,
        top: 0,
        width: 300,
        height: 60,
        right: 300,
        bottom: 60,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  });

  const yearWidth = 100;

  Array.from({ length: 3 }).forEach((_, index) => {
    const yearElement = document.createElement("div");
    yearElement.setAttribute("data-year-index", String(index));
    Object.defineProperty(yearElement, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          left: index * yearWidth,
          top: 0,
          width: yearWidth,
          height: 40,
          right: index * yearWidth + yearWidth,
          bottom: 40,
          x: index * yearWidth,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    container.appendChild(yearElement);
  });

  document.body.appendChild(container);

  return {
    container,
    ref: { current: container } as RefObject<HTMLDivElement>,
    cleanup: () => {
      container.remove();
    },
  };
};

describe("useMegaOverlayState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("opens the overlay with calculated position and tracks active year", () => {
    const { ref, cleanup } = createContainerRef();
    const onOpen = vi.fn();

    const { result, unmount } = renderHook(() =>
      useMegaOverlayState({ containerRef: ref, years: [2020, 2021, 2022], onOpen })
    );

    act(() => {
      result.current.open(1);
    });

    expect(result.current.visible).toBe(true);
    expect(result.current.year).toBe(2021);
    expect(result.current.activeYearIndex).toBe(1);
    expect(result.current.position).toEqual({ left: 50, top: 27, width: 200 });
    expect(onOpen).toHaveBeenCalledWith({ yearIndex: 1, year: 2021 });

    unmount();
    cleanup();
  });

  it("closes the overlay after a scheduled hide", () => {
    const { ref, cleanup } = createContainerRef();
    const onClose = vi.fn();

    const { result, unmount } = renderHook(() =>
      useMegaOverlayState({ containerRef: ref, years: [2020, 2021, 2022], onClose })
    );

    act(() => {
      result.current.open(2);
    });

    act(() => {
      result.current.scheduleHide(150);
    });

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(result.current.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.visible).toBe(false);
    expect(result.current.year).toBeNull();
    expect(result.current.activeYearIndex).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    cleanup();
  });

  it("prevents hide when pointer enters before timeout", () => {
    const { ref, cleanup } = createContainerRef();

    const { result, unmount } = renderHook(() =>
      useMegaOverlayState({ containerRef: ref, years: [2020, 2021, 2022] })
    );

    act(() => {
      result.current.open(0);
    });

    act(() => {
      result.current.scheduleHide(100);
    });

    act(() => {
      result.current.pointerEnteredOverlay();
    });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.visible).toBe(true);

    unmount();
    cleanup();
  });

  it("hides after pointer leaves overlay with delay", () => {
    const { ref, cleanup } = createContainerRef();

    const { result, unmount } = renderHook(() =>
      useMegaOverlayState({ containerRef: ref, years: [2020, 2021, 2022] })
    );

    act(() => {
      result.current.open(1);
    });

    act(() => {
      result.current.pointerEnteredOverlay();
    });

    act(() => {
      result.current.pointerLeftOverlay(80);
    });

    act(() => {
      vi.advanceTimersByTime(80);
    });

    expect(result.current.visible).toBe(false);

    unmount();
    cleanup();
  });
});

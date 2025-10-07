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

  it("calculates correct position for first year (left-aligned)", () => {
    const { ref, cleanup } = createContainerRef();

    const { result, unmount } = renderHook(() =>
      useMegaOverlayState({ containerRef: ref, years: [2020, 2021, 2022] })
    );

    act(() => {
      result.current.open(0);
    });

    // First year should be left-aligned (left: 0)
    expect(result.current.position).toEqual({ left: 0, top: 27, width: 200 });
    expect(result.current.year).toBe(2020);

    unmount();
    cleanup();
  });

  it("calculates correct position for middle year (centered)", () => {
    const { ref, cleanup } = createContainerRef();

    const { result, unmount } = renderHook(() =>
      useMegaOverlayState({ containerRef: ref, years: [2020, 2021, 2022] })
    );

    act(() => {
      result.current.open(1);
    });

    // Middle year should be centered: yearLeft (100) + yearWidth/2 (50) - overlayWidth/2 (100) = 50
    expect(result.current.position).toEqual({ left: 50, top: 27, width: 200 });
    expect(result.current.year).toBe(2021);

    unmount();
    cleanup();
  });

  it("calculates correct position for last year (right-aligned)", () => {
    const { ref, cleanup } = createContainerRef();

    const { result, unmount } = renderHook(() =>
      useMegaOverlayState({ containerRef: ref, years: [2020, 2021, 2022] })
    );

    act(() => {
      result.current.open(2);
    });

    // Last year should be right-aligned: containerWidth (300) - overlayWidth (200) = 100
    expect(result.current.position).toEqual({ left: 100, top: 27, width: 200 });
    expect(result.current.year).toBe(2022);

    unmount();
    cleanup();
  });
});

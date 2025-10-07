import { act, renderHook } from "@testing-library/react";
import type { MutableRefObject, RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimelineTouch } from "../components/timelineYears/hooks/useTimelineTouch";

const createTouch = (x: number, y: number, identifier?: number) =>
  ({ clientX: x, clientY: y, identifier }) as unknown as Touch;

type HookProps = Parameters<typeof useTimelineTouch>[0];

type MutablePointRef = MutableRefObject<{ x: number; y: number } | null>;

const setupHook = (overrides?: Partial<HookProps>) => {
  const container = document.createElement("div");
  const child = document.createElement("div");
  container.appendChild(child);
  document.body.appendChild(container);

  const yearsScrollContainerRef: RefObject<HTMLDivElement> = { current: container };
  const pointerPositionRef: MutablePointRef = { current: null };
  const touchDragActiveRef: MutableRefObject<boolean> = { current: false };

  const getYearIndexFromPoint = vi.fn<HookProps["getYearIndexFromPoint"]>().mockReturnValue(2);
  const handleYearHover = vi.fn<HookProps["handleYearHover"]>();
  const markUserInteracted = vi.fn<HookProps["markUserInteracted"]>();
  const stopAutoScroll = vi.fn<HookProps["stopAutoScroll"]>();
  const updateAutoScrollFromPointer = vi.fn<HookProps["updateAutoScrollFromPointer"]>();

  const initialProps: HookProps = {
    yearsScrollContainerRef,
    pointerPositionRef,
    touchDragActiveRef,
    updateAutoScrollFromPointer,
    getYearIndexFromPoint,
    handleYearHover,
    markUserInteracted,
    stopAutoScroll,
    megaOverlayVisible: false,
    ...overrides,
  };

  let currentProps = initialProps;

  const hook = renderHook((props: HookProps) => useTimelineTouch(props), {
    initialProps: currentProps,
  });

  const rerender = (next: Partial<HookProps>) => {
    currentProps = { ...currentProps, ...next };
    hook.rerender(currentProps);
  };

  const cleanup = () => {
    if (container.parentElement) {
      container.parentElement.removeChild(container);
    }
    hook.unmount();
  };

  return {
    hook,
    child,
    container,
    pointerPositionRef,
    touchDragActiveRef,
    getYearIndexFromPoint,
    handleYearHover,
    markUserInteracted,
    stopAutoScroll,
    updateAutoScrollFromPointer,
    cleanup,
    rerender,
  };
};

describe("useTimelineTouch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("activates touch drag and triggers hover on touch start", () => {
    const {
      hook,
      child,
      pointerPositionRef,
      touchDragActiveRef,
      handleYearHover,
      markUserInteracted,
      updateAutoScrollFromPointer,
      cleanup,
    } = setupHook();

    const touch = createTouch(10, 20);
    const event = {
      touches: [touch],
      target: child,
      nativeEvent: { cancelable: false, defaultPrevented: false },
    } as unknown as React.TouchEvent<HTMLDivElement>;

    act(() => {
      hook.result.current.handleTouchStart(event);
    });

    expect(touchDragActiveRef.current).toBe(true);
    expect(pointerPositionRef.current).toEqual({ x: 10, y: 20 });
    expect(handleYearHover).toHaveBeenCalledWith(2);
    expect(markUserInteracted).toHaveBeenCalledTimes(1);
    expect(updateAutoScrollFromPointer).toHaveBeenCalledWith(10);

    cleanup();
  });

  it("prevents default on horizontal move and continues hover updates", () => {
    const {
      hook,
      child,
      pointerPositionRef,
      touchDragActiveRef,
      getYearIndexFromPoint,
      updateAutoScrollFromPointer,
      cleanup,
    } = setupHook();

    const startTouch = createTouch(5, 5);
    const startEvent = {
      touches: [startTouch],
      target: child,
      nativeEvent: { cancelable: false, defaultPrevented: false },
    } as unknown as React.TouchEvent<HTMLDivElement>;

    act(() => {
      hook.result.current.handleTouchStart(startEvent);
    });

    expect(touchDragActiveRef.current).toBe(true);

    const moveTouch = createTouch(30, 8);
    const preventDefault = vi.fn();
    const moveEvent = {
      touches: [moveTouch],
      target: child,
      nativeEvent: {
        cancelable: true,
        defaultPrevented: false,
        preventDefault,
      },
    } as unknown as React.TouchEvent<HTMLDivElement>;

    act(() => {
      hook.result.current.handleTouchMove(moveEvent);
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(pointerPositionRef.current).toEqual({ x: 30, y: 8 });
    expect(getYearIndexFromPoint).toHaveBeenCalledWith(30, 8);
    expect(updateAutoScrollFromPointer).toHaveBeenLastCalledWith(30);

    cleanup();
  });

  it("resets state and stops auto scroll on touch end", () => {
    const { hook, child, pointerPositionRef, touchDragActiveRef, stopAutoScroll, cleanup } =
      setupHook();

    const touch = createTouch(12, 18);
    const startEvent = {
      touches: [touch],
      target: child,
      nativeEvent: { cancelable: false, defaultPrevented: false },
    } as unknown as React.TouchEvent<HTMLDivElement>;

    act(() => {
      hook.result.current.handleTouchStart(startEvent);
    });

    act(() => {
      hook.result.current.handleTouchEnd();
    });

    expect(touchDragActiveRef.current).toBe(false);
    expect(pointerPositionRef.current).toBeNull();
    expect(hook.result.current.touchCursorPosition).toBeNull();
    expect(stopAutoScroll).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("captures initial overlay touch when overlay becomes visible and clears on hide", () => {
    const { hook, child, touchDragActiveRef, rerender, cleanup } = setupHook();

    const touch = createTouch(40, 50, 7);
    const event = {
      touches: [touch],
      target: child,
      nativeEvent: { cancelable: false, defaultPrevented: false },
    } as unknown as React.TouchEvent<HTMLDivElement>;

    act(() => {
      hook.result.current.handleTouchStart(event);
    });

    expect(touchDragActiveRef.current).toBe(true);

    rerender({ megaOverlayVisible: true });

    expect(hook.result.current.initialOverlayTouch).not.toBeNull();
    expect(hook.result.current.initialOverlayTouch).toMatchObject({ clientX: 40, clientY: 50 });

    rerender({ megaOverlayVisible: false });
    expect(hook.result.current.initialOverlayTouch).toBeNull();

    cleanup();
  });
});

import { act, renderHook } from "@testing-library/react";
import type { MutableRefObject, RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTimelinePointer } from "../components/timelineYears/hooks/useTimelinePointer";

type HookProps = Parameters<typeof useTimelinePointer>[0];

type SetupOverrides = Partial<HookProps>;

type PointerRef = MutableRefObject<{ x: number; y: number } | null>;

type UpdateEdgeScrollMock = ReturnType<typeof vi.fn<HookProps["updateEdgeScrollFromPointer"]>>;

const setupHook = (overrides: SetupOverrides = {}) => {
  const container = document.createElement("div");
  const child = document.createElement("div");
  container.appendChild(child);
  document.body.appendChild(container);

  const yearsScrollContainerRef: RefObject<HTMLDivElement> = { current: container };
  const touchDragActiveRef: MutableRefObject<boolean> = { current: false };

  const markUserInteracted = vi.fn<HookProps["markUserInteracted"]>();
  const stopAutoScroll = vi.fn<HookProps["stopAutoScroll"]>();
  const updateEdgeScrollFromPointer = vi.fn<HookProps["updateEdgeScrollFromPointer"]>();

  const baseProps: HookProps = {
    yearsScrollContainerRef,
    touchDragActiveRef,
    isTouchDevice: false,
    markUserInteracted,
    stopAutoScroll,
    updateEdgeScrollFromPointer,
  };

  let currentProps: HookProps = { ...baseProps, ...overrides };

  const hook = renderHook((props: HookProps) => useTimelinePointer(props), {
    initialProps: currentProps,
  });

  const rerender = (next: SetupOverrides = {}) => {
    currentProps = { ...currentProps, ...next };
    hook.rerender(currentProps);
  };

  const cleanup = () => {
    hook.unmount();
    if (container.parentElement) {
      container.parentElement.removeChild(container);
    }
  };

  return {
    hook,
    container,
    child,
    pointerPositionRef: hook.result.current.pointerPositionRef as PointerRef,
    touchDragActiveRef,
    markUserInteracted,
    stopAutoScroll,
    updateEdgeScrollFromPointer: updateEdgeScrollFromPointer as UpdateEdgeScrollMock,
    rerender,
    cleanup,
  };
};

const getLastEdgeScrollCall = (mock: UpdateEdgeScrollMock) => {
  const calls = mock.mock.calls;
  return calls[calls.length - 1] as [number, boolean] | undefined;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useTimelinePointer", () => {
  it("engages pointer on mouse down and marks interaction", () => {
    const {
      hook,
      child,
      pointerPositionRef,
      markUserInteracted,
      updateEdgeScrollFromPointer,
      cleanup,
    } = setupHook();

    const event = {
      button: 0,
      clientX: 120,
      clientY: 90,
      target: child,
    } as unknown as React.MouseEvent<HTMLDivElement>;

    act(() => {
      hook.result.current.handleMouseDown(event);
    });

    expect(pointerPositionRef.current).toEqual({ x: 120, y: 90 });
    expect(markUserInteracted).toHaveBeenCalledTimes(1);
    expect(updateEdgeScrollFromPointer).toHaveBeenCalledWith(120, true);

    cleanup();
  });

  it("skips mouse handlers on touch devices", () => {
    const {
      hook,
      child,
      pointerPositionRef,
      markUserInteracted,
      updateEdgeScrollFromPointer,
      cleanup,
    } = setupHook({ isTouchDevice: true });

    const event = {
      button: 0,
      clientX: 50,
      clientY: 70,
      target: child,
    } as unknown as React.MouseEvent<HTMLDivElement>;

    act(() => {
      hook.result.current.handleMouseDown(event);
      hook.result.current.handleMouseMove(event);
      hook.result.current.handleMouseUp();
    });

    expect(pointerPositionRef.current).toBeNull();
    expect(markUserInteracted).not.toHaveBeenCalled();
    expect(updateEdgeScrollFromPointer).not.toHaveBeenCalled();

    cleanup();
  });

  it("updates pointer position on mouse move and respects container ancestry", () => {
    const {
      hook,
      child,
      pointerPositionRef,
      markUserInteracted,
      updateEdgeScrollFromPointer,
      cleanup,
    } = setupHook();

    const insideEvent = {
      clientX: 30,
      clientY: 45,
      target: child,
    } as unknown as React.MouseEvent<HTMLDivElement>;

    act(() => {
      hook.result.current.handleMouseMove(insideEvent);
    });

    expect(pointerPositionRef.current).toEqual({ x: 30, y: 45 });
    expect(markUserInteracted).toHaveBeenCalledTimes(1);
    expect(getLastEdgeScrollCall(updateEdgeScrollFromPointer)).toEqual([30, true]);

    markUserInteracted.mockClear();
    updateEdgeScrollFromPointer.mockClear();

    const outsideTarget = document.createElement("div");
    document.body.appendChild(outsideTarget);

    const outsideEvent = {
      clientX: 60,
      clientY: 75,
      target: outsideTarget,
    } as unknown as React.MouseEvent<HTMLDivElement>;

    act(() => {
      hook.result.current.handleMouseMove(outsideEvent);
    });

    expect(pointerPositionRef.current).toEqual({ x: 60, y: 75 });
    expect(markUserInteracted).not.toHaveBeenCalled();
    expect(getLastEdgeScrollCall(updateEdgeScrollFromPointer)).toEqual([60, true]);

    cleanup();
  });

  it("resets pointer on mouse up and leave", () => {
    const { hook, child, pointerPositionRef, stopAutoScroll, cleanup } = setupHook();

    const downEvent = {
      button: 0,
      clientX: 10,
      clientY: 15,
      target: child,
    } as unknown as React.MouseEvent<HTMLDivElement>;

    act(() => {
      hook.result.current.handleMouseDown(downEvent);
    });

    stopAutoScroll.mockClear();

    act(() => {
      hook.result.current.handleMouseLeave();
    });

    expect(stopAutoScroll).not.toHaveBeenCalled();

    act(() => {
      hook.result.current.handleMouseUp();
    });

    expect(pointerPositionRef.current).toBeNull();
    expect(stopAutoScroll).toHaveBeenCalledTimes(1);

    stopAutoScroll.mockClear();

    act(() => {
      hook.result.current.handleMouseLeave();
    });

    expect(stopAutoScroll).toHaveBeenCalledTimes(1);
    expect(pointerPositionRef.current).toBeNull();

    cleanup();
  });

  it("derives active pointer state from touch drag and pointer refs", () => {
    const { hook, pointerPositionRef, touchDragActiveRef, updateEdgeScrollFromPointer, cleanup } =
      setupHook();

    act(() => {
      hook.result.current.updateAutoScrollFromPointer(100);
    });

    expect(updateEdgeScrollFromPointer).toHaveBeenCalledWith(100, false);

    updateEdgeScrollFromPointer.mockClear();
    pointerPositionRef.current = { x: 200, y: 220 };

    act(() => {
      hook.result.current.updateAutoScrollFromPointer(110);
    });

    expect(updateEdgeScrollFromPointer).toHaveBeenCalledWith(110, true);

    updateEdgeScrollFromPointer.mockClear();
    pointerPositionRef.current = null;
    touchDragActiveRef.current = true;

    act(() => {
      hook.result.current.updateAutoScrollFromPointer(120);
    });

    expect(updateEdgeScrollFromPointer).toHaveBeenCalledWith(120, true);

    cleanup();
  });
});

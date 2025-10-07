import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HINT_DELAY_MS, useMouseHint } from "../components/timelineYears/hooks/useMouseHint";

describe("useMouseHint", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("shows the hint after the delay when timeline is visible", () => {
    const { result, rerender } = renderHook(({ visible }) => useMouseHint(visible), {
      initialProps: { visible: false },
    });

    expect(result.current.showHint).toBe(false);

    rerender({ visible: true });

    act(() => {
      vi.advanceTimersByTime(HINT_DELAY_MS - 1);
    });
    expect(result.current.showHint).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.showHint).toBe(true);
  });

  it("does not show the hint once the user has interacted", () => {
    const { result, rerender } = renderHook(({ visible }) => useMouseHint(visible), {
      initialProps: { visible: true },
    });

    act(() => {
      result.current.markInteracted();
    });

    act(() => {
      vi.advanceTimersByTime(HINT_DELAY_MS + 100);
    });
    expect(result.current.showHint).toBe(false);

    rerender({ visible: false });
    rerender({ visible: true });

    act(() => {
      vi.advanceTimersByTime(HINT_DELAY_MS + 100);
    });
    expect(result.current.showHint).toBe(false);
  });

  it("hides the hint when the timeline is hidden", () => {
    const { result, rerender } = renderHook(({ visible }) => useMouseHint(visible), {
      initialProps: { visible: true },
    });

    act(() => {
      vi.advanceTimersByTime(HINT_DELAY_MS + 10);
    });
    expect(result.current.showHint).toBe(true);

    rerender({ visible: false });
    expect(result.current.showHint).toBe(false);
  });
});

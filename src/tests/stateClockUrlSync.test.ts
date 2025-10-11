import { beforeEach, describe, expect, it } from "vitest";
import { create, type StateCreator } from "zustand";
import { createStateClock } from "store/slices/stateClock";

const createClockTestStore = () => {
  const slice = createStateClock as unknown as StateCreator<ClockState, [], [], ClockState>;
  return create<ClockState>()(slice);
};

describe("stateClock URL syncing", () => {
  let store: ReturnType<typeof createClockTestStore>;

  beforeEach(() => {
    store = createClockTestStore();
    window.history.replaceState(null, "", "/");
  });

  it("writes date-only slug by default", () => {
    store.getState().setDateOnly("2024-01-01");

    expect(window.location.pathname).toBe("/2024-01-01");
  });

  it("includes time slug only when requested", () => {
    store.getState().setDateTime("2024-01-01", 3661, { includeTimeInUrl: true });
    expect(window.location.pathname).toBe("/2024-01-01T01:01:01");

    store.getState().setTimeOnly(4000);
    expect(window.location.pathname).toBe("/2024-01-01");
  });

  it("clears slug when date is cleared", () => {
    store.getState().setDateOnly("2023-05-05");
    store.getState().setDateOnly(null);

    expect(window.location.pathname).toBe("/");
  });
});

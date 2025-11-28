import { beforeEach, describe, expect, it } from "vitest";
import { create, type StateCreator } from "zustand";
import { createClockSlice } from "store/slices/stateClock";
import type { ClockSlice } from "store/types";

const createClockTestStore = () => {
  const slice = createClockSlice as unknown as StateCreator<ClockSlice, [], [], ClockSlice>;
  return create<ClockSlice>()(slice);
};

describe("stateClock URL syncing", () => {
  let store: ReturnType<typeof createClockTestStore>;

  beforeEach(() => {
    store = createClockTestStore();
    window.history.replaceState(null, "", "/");
  });

  it("writes date-only slug by default", () => {
    store.getState().clock.setDateOnly("2024-01-01");

    expect(window.location.pathname).toBe("/2024-01-01");
  });

  it("includes time slug when requested", () => {
    store.getState().clock.setDateTime("2024-01-01", 3661, { includeTimeInUrl: true });
    expect(window.location.pathname).toBe("/2024-01-01T01:01:01");
  });

  it("clears slug when date is cleared", () => {
    store.getState().clock.setDateOnly("2023-05-05");
    store.getState().clock.setDateOnly(null);

    expect(window.location.pathname).toBe("/");
  });
});

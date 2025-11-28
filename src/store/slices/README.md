# Store Slices

This directory contains the individual slices of the Zustand store, organized by domain:

## Slices

- **`stateClock.ts`** – Clock state (start/stop timestamps, running state, selection helpers)
- **`stateHover.ts`** – Hover state (hover seconds, hovered date)
- **`stateToggle.ts`** – Global toggles (mute, overlays, visibility)
- **`stateCrewSelection.ts`** – Crew member, expedition and notable moment selection
- **`stateContentHighlights.ts`** – Content highlight tracking helpers
- **`stateDayNight.ts`** – Day/night overlays

## Structure

Each slice file exports a `create*Slice` factory that namespaces state + actions under a single key:

```typescript
export const createExampleSlice: StateCreator<AppStore, [], [], ExampleSlice> = (set) => ({
  example: {
    value: 0,
    setValue: (next: number) =>
      set((state) => ({
        example: {
          ...state.example,
          value: next,
        },
      })),
  },
});
```

## Usage

All slices are composed together in the main store file (`../index.ts`). Selector hooks under `../hooks/` simply subscribe to the relevant namespaced slice (for example `useStateClock` returns `state.clock`).

## Types

Type definitions for each slice now live in `src/store/types.ts`, which also exports the combined `AppStore` interface.

# Store Slices

This directory contains the individual slices of the Zustand store, organized by domain:

## Slices

- **`stateClock.ts`** - Manages clock state (start/stop timestamps, running state)
- **`stateHover.ts`** - Manages hover state (hover seconds, hovered date)
- **`stateSelectedDate.ts`** - Manages selected date state
- **`stateToggle.ts`** - Manages global toggles (mute, globe visibility)
- **`stateCrewSelection.ts`** - Manages crew member selection
- **`stateContentHighlights.ts`** - Manages content highlights array

## Structure

Each slice file exports a `createState*` function that follows the Zustand slice pattern:

```typescript
export const createStateName: StateCreator<AppState, [], [], StateInterface> = (set) => ({
  // Initial state
  someState: initialValue,

  // Actions
  setSomeState: (value) => set({ someState: value }),
});
```

## Usage

All slices are composed together in the main store file (`../index.ts`). The corresponding selector hooks are organized in the `../hooks/` directory, with each hook file matching its slice counterpart.

## Types

Type definitions for each slice are maintained in `src/typings/store.d.ts` to keep them centralized and avoid duplication.

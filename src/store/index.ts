import { createStore } from "zustand";
import { useStore } from "zustand/react";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type { AppStore } from "./types";
import { createClockSlice } from "./slices/stateClock";
import { createHoverSlice } from "./slices/stateHover";
import { createToggleSlice } from "./slices/stateToggle";
import { createCrewSelectionSlice } from "./slices/stateSearchHighlights";
import { createContentHighlightsSlice } from "./slices/stateContentHighlights";
import { createDayNightSlice } from "./slices/stateDayNight";

const store = createStore<AppStore>()(
  devtools(
    (set, get, api) => ({
      ...createClockSlice(set, get, api),
      ...createHoverSlice(set, get, api),
      ...createToggleSlice(set, get, api),
      ...createCrewSelectionSlice(set, get, api),
      ...createContentHighlightsSlice(set, get, api),
      ...createDayNightSlice(set, get, api),
    }),
    { name: "ISSiRT Zustand Store" }
  )
);

type Selector<T> = (state: AppStore) => T;

export const useAppStore = <T>(selector: Selector<T>): T => useStore(store, useShallow(selector));

export { store as appStore };

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { createStateClock } from "./slices/stateClock";
import { createStateHover } from "./slices/stateHover";
import { createStateToggle } from "./slices/stateToggle";
import { createStateCrewSelection } from "./slices/stateCrewSelection";
import { createStateContentHighlights } from "./slices/stateContentHighlights";

// Create store with redux devtools middleware
export const useAppStore = create<AppState>()(
  devtools(
    (...a) => ({
      ...createStateClock(...a),
      ...createStateHover(...a),
      ...createStateToggle(...a),
      ...createStateCrewSelection(...a),
      ...createStateContentHighlights(...a),
    }),
    { name: "ISSiRT Zustand Store" }
  )
);

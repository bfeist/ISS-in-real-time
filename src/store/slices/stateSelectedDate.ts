import { StateCreator } from "zustand";

export const createStateSelectedDate: StateCreator<AppState, [], [], SelectedDateState> = (
  set
) => ({
  // Selected date initial state
  selectedDate: null,

  // Actions
  setSelectedDate: (date: string | null) => set({ selectedDate: date }),
});

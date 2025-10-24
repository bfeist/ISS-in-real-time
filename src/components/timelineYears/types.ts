export type InteractionMode = "mouse" | "touch" | "pen";

export const isTouchLikeInteraction = (mode: InteractionMode | null | undefined): boolean => {
  if (!mode) {
    return false;
  }

  return mode === "touch" || mode === "pen";
};

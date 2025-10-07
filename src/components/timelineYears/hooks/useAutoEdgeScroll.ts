import { RefObject, useCallback, useEffect, useRef } from "react";

const BASE_EDGE_SCROLL_ZONE_PX = 160;
const NARROW_SCREEN_EDGE_SCROLL_ZONE_PX = 64;
const NARROW_SCREEN_MAX_WIDTH = 500;
const MIN_SCROLL_SPEED_PX_PER_SEC = 120;
const MAX_SCROLL_SPEED_PX_PER_SEC = 800;

const getEdgeScrollZonePx = () => {
  if (typeof window === "undefined") {
    return BASE_EDGE_SCROLL_ZONE_PX;
  }

  return window.innerWidth <= NARROW_SCREEN_MAX_WIDTH
    ? NARROW_SCREEN_EDGE_SCROLL_ZONE_PX
    : BASE_EDGE_SCROLL_ZONE_PX;
};

type AutoScrollState = {
  isActive: boolean;
  direction: number;
  speed: number;
  frameId: number;
  lastTimestamp: number;
};

type UseAutoEdgeScrollOptions = {
  isEnabled?: boolean;
};

type AutoEdgeScrollController = {
  updateFromPointer: (clientX: number, hasActivePointer: boolean) => void;
  stop: () => void;
};

export const useAutoEdgeScroll = (
  containerRef: RefObject<HTMLDivElement>,
  options: UseAutoEdgeScrollOptions = {}
): AutoEdgeScrollController => {
  const { isEnabled = true } = options;

  const autoScrollStateRef = useRef<AutoScrollState>({
    isActive: false,
    direction: 0,
    speed: 0,
    frameId: 0,
    lastTimestamp: 0,
  });

  const stop = useCallback(() => {
    const state = autoScrollStateRef.current;
    if (state.frameId) {
      cancelAnimationFrame(state.frameId);
    }
    state.frameId = 0;
    state.isActive = false;
    state.direction = 0;
    state.speed = 0;
    state.lastTimestamp = 0;
  }, []);

  const autoScrollStep = useCallback(
    function step(timestamp: number) {
      const container = containerRef.current;
      const state = autoScrollStateRef.current;

      if (!container || !state.isActive) {
        stop();
        return;
      }

      if (state.lastTimestamp === 0) {
        state.lastTimestamp = timestamp;
        if (state.isActive) {
          state.frameId = requestAnimationFrame(step);
        }
        return;
      }

      const delta = timestamp - state.lastTimestamp;
      state.lastTimestamp = timestamp;

      const distance = (state.speed * delta) / 1000;
      if (distance <= 0 || state.direction === 0) {
        stop();
        return;
      }

      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 0) {
        stop();
        return;
      }

      const previousScrollLeft = container.scrollLeft;
      const targetScrollLeft = previousScrollLeft + state.direction * distance;
      const clampedScrollLeft = Math.min(Math.max(targetScrollLeft, 0), maxScrollLeft);
      container.scrollLeft = clampedScrollLeft;

      const reachedStart = state.direction < 0 && clampedScrollLeft <= 0;
      const reachedEnd = state.direction > 0 && clampedScrollLeft >= maxScrollLeft;

      if (reachedStart || reachedEnd) {
        stop();
        return;
      }

      if (!state.isActive) {
        return;
      }

      state.frameId = requestAnimationFrame(step);
    },
    [containerRef, stop]
  );

  const start = useCallback(
    (direction: number, speed: number) => {
      const container = containerRef.current;
      if (!container || direction === 0 || speed <= 0) {
        stop();
        return;
      }

      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 0) {
        stop();
        return;
      }

      const normalizedDirection = Math.sign(direction);
      if (normalizedDirection === 0) {
        stop();
        return;
      }

      if (normalizedDirection < 0 && container.scrollLeft <= 0) {
        stop();
        return;
      }

      if (normalizedDirection > 0 && container.scrollLeft >= maxScrollLeft) {
        stop();
        return;
      }

      const state = autoScrollStateRef.current;
      state.direction = normalizedDirection;
      state.speed = speed;

      if (!state.isActive) {
        state.isActive = true;
        state.lastTimestamp = 0;
        state.frameId = requestAnimationFrame(autoScrollStep);
      }
    },
    [autoScrollStep, containerRef, stop]
  );

  const updateFromPointer = useCallback(
    (clientX: number, hasActivePointer: boolean) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      if (!isEnabled) {
        stop();
        return;
      }

      if (!hasActivePointer) {
        stop();
        return;
      }

      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 0) {
        stop();
        return;
      }

      const rect = container.getBoundingClientRect();
      const effectiveEdgeZone = Math.min(getEdgeScrollZonePx(), rect.width / 2);
      if (effectiveEdgeZone <= 0) {
        stop();
        return;
      }

      const distanceToLeft = clientX - rect.left;
      const distanceToRight = rect.right - clientX;
      const withinLeftZone =
        distanceToLeft >= -effectiveEdgeZone && distanceToLeft <= effectiveEdgeZone;
      const withinRightZone =
        distanceToRight >= -effectiveEdgeZone && distanceToRight <= effectiveEdgeZone;

      if (!withinLeftZone && !withinRightZone) {
        stop();
        return;
      }

      const distanceWithinZone = withinLeftZone
        ? Math.max(0, Math.min(distanceToLeft, effectiveEdgeZone))
        : Math.max(0, Math.min(distanceToRight, effectiveEdgeZone));

      const proximityFactor = 1 - distanceWithinZone / effectiveEdgeZone;

      const speed =
        MIN_SCROLL_SPEED_PX_PER_SEC +
        (MAX_SCROLL_SPEED_PX_PER_SEC - MIN_SCROLL_SPEED_PX_PER_SEC) * proximityFactor;

      const direction = withinLeftZone ? -1 : 1;
      start(direction, speed);
    },
    [containerRef, isEnabled, start, stop]
  );

  useEffect(() => {
    if (!isEnabled) {
      stop();
    }
  }, [isEnabled, stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { updateFromPointer, stop };
};

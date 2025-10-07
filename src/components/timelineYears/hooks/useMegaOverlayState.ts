import { RefObject, useCallback, useEffect, useRef, useState } from "react";

type OverlayPosition = {
  left: number;
  top: number;
  width: number;
};

type OpenPayload = {
  yearIndex: number;
  year: number;
};

type UseMegaOverlayStateOptions = {
  containerRef: RefObject<HTMLDivElement>;
  years: number[];
  onOpen?: (payload: OpenPayload) => void;
  onClose?: () => void;
  overlayWidthMultiplier?: number;
  yearHeaderHeight?: number;
  overlayOffset?: number;
};

type MegaOverlayController = {
  visible: boolean;
  year: number | null;
  position: OverlayPosition;
  activeYearIndex: number | null;
  open: (yearIndex: number) => void;
  close: () => void;
  scheduleHide: (delayMs: number) => void;
  cancelHide: () => void;
  pointerEnteredOverlay: () => void;
  pointerLeftOverlay: (delayMs: number) => void;
};

const DEFAULT_POSITION: OverlayPosition = { left: 0, top: 0, width: 0 };

export const useMegaOverlayState = ({
  containerRef,
  years,
  onOpen,
  onClose,
  overlayWidthMultiplier = 2,
  yearHeaderHeight = 25,
  overlayOffset = 2,
}: UseMegaOverlayStateOptions): MegaOverlayController => {
  const [visible, setVisible] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [position, setPosition] = useState<OverlayPosition>(DEFAULT_POSITION);
  const [activeYearIndex, setActiveYearIndex] = useState<number | null>(null);

  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pointerInsideOverlayRef = useRef(false);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearHideTimeout();
    pointerInsideOverlayRef.current = false;
    setVisible(false);
    setYear(null);
    setPosition(DEFAULT_POSITION);
    setActiveYearIndex(null);
    onClose?.();
  }, [clearHideTimeout, onClose]);

  const open = useCallback(
    (yearIndex: number) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const yearElements = container.querySelectorAll<HTMLElement>("[data-year-index]");
      const yearElement = yearElements[yearIndex];
      if (!yearElement) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const yearRect = yearElement.getBoundingClientRect();
      const overlayWidth = yearRect.width * overlayWidthMultiplier;

      let left: number;
      if (yearIndex === 0) {
        left = 0;
      } else if (yearIndex === years.length - 1) {
        left = containerRect.width - overlayWidth;
      } else {
        left = yearRect.left - containerRect.left + yearRect.width / 2 - overlayWidth / 2;
      }

      const top = yearRect.top - containerRect.top + yearHeaderHeight + overlayOffset;

      clearHideTimeout();
      pointerInsideOverlayRef.current = false;
      setVisible(true);
      setYear(years[yearIndex]);
      setPosition({ left, top, width: overlayWidth });
      setActiveYearIndex(yearIndex);
      onOpen?.({ yearIndex, year: years[yearIndex] });
    },
    [
      clearHideTimeout,
      containerRef,
      overlayOffset,
      overlayWidthMultiplier,
      yearHeaderHeight,
      years,
      onOpen,
    ]
  );

  const scheduleHide = useCallback(
    (delayMs: number) => {
      clearHideTimeout();
      hideTimeoutRef.current = setTimeout(() => {
        if (!pointerInsideOverlayRef.current) {
          close();
        }
      }, delayMs);
    },
    [clearHideTimeout, close]
  );

  const cancelHide = useCallback(() => {
    clearHideTimeout();
  }, [clearHideTimeout]);

  const pointerEnteredOverlay = useCallback(() => {
    pointerInsideOverlayRef.current = true;
    clearHideTimeout();
  }, [clearHideTimeout]);

  const pointerLeftOverlay = useCallback(
    (delayMs: number) => {
      pointerInsideOverlayRef.current = false;
      scheduleHide(delayMs);
    },
    [scheduleHide]
  );

  useEffect(() => {
    return () => {
      clearHideTimeout();
    };
  }, [clearHideTimeout]);

  return {
    visible,
    year,
    position,
    activeYearIndex,
    open,
    close,
    scheduleHide,
    cancelHide,
    pointerEnteredOverlay,
    pointerLeftOverlay,
  };
};

export type { MegaOverlayController, OverlayPosition };

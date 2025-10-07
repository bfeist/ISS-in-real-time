import {
  MutableRefObject,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Point = { x: number; y: number };

type TouchInfo = {
  clientX: number;
  clientY: number;
  identifier?: number;
};

type InitialOverlayTouch = TouchInfo & { sequence: number };

type TouchEventLike = React.Touch | Touch;

type GetYearIndexFromPoint = (clientX: number, clientY: number) => number | null;

type UseTimelineTouchOptions = {
  yearsScrollContainerRef: RefObject<HTMLDivElement>;
  pointerPositionRef: MutableRefObject<Point | null>;
  touchDragActiveRef: MutableRefObject<boolean>;
  updateAutoScrollFromPointer: (clientX: number) => void;
  getYearIndexFromPoint: GetYearIndexFromPoint;
  handleYearHover: (yearIndex: number) => void;
  markUserInteracted: () => void;
  stopAutoScroll: () => void;
  megaOverlayVisible: boolean;
};

type UseTimelineTouchResult = {
  touchCursorPosition: Point | null;
  initialOverlayTouch: InitialOverlayTouch | null;
  handleTouchStart: (event: React.TouchEvent<HTMLDivElement>) => void;
  handleTouchMove: (event: React.TouchEvent<HTMLDivElement>) => void;
  handleTouchEnd: () => void;
  handleTouchCancel: () => void;
};

export const useTimelineTouch = ({
  yearsScrollContainerRef,
  pointerPositionRef,
  touchDragActiveRef,
  updateAutoScrollFromPointer,
  getYearIndexFromPoint,
  handleYearHover,
  markUserInteracted,
  stopAutoScroll,
  megaOverlayVisible,
}: UseTimelineTouchOptions): UseTimelineTouchResult => {
  const touchStartPositionRef = useRef<Point | null>(null);
  const lastTouchYearIndexRef = useRef<number | null>(null);
  const lastTouchInfoRef = useRef<TouchInfo | null>(null);
  const overlayVisibilityRef = useRef(false);
  const [touchCursorPosition, setTouchCursorPosition] = useState<Point | null>(null);
  const [initialOverlayTouch, setInitialOverlayTouch] = useState<InitialOverlayTouch | null>(null);

  const updateHoverFromTouch = useCallback(
    (touch: TouchEventLike) => {
      const yearIndex = getYearIndexFromPoint(touch.clientX, touch.clientY);
      if (yearIndex !== null) {
        if (lastTouchYearIndexRef.current !== yearIndex) {
          lastTouchYearIndexRef.current = yearIndex;
          handleYearHover(yearIndex);
        }
      }

      setTouchCursorPosition({ x: touch.clientX, y: touch.clientY });
      pointerPositionRef.current = { x: touch.clientX, y: touch.clientY };
      updateAutoScrollFromPointer(touch.clientX);
      lastTouchInfoRef.current = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        identifier: "identifier" in touch ? touch.identifier : undefined,
      };
    },
    [getYearIndexFromPoint, handleYearHover, pointerPositionRef, updateAutoScrollFromPointer]
  );

  const isEventFromScrollContainer = useCallback(
    (eventTarget: EventTarget | null) => {
      const container = yearsScrollContainerRef.current;
      if (!container || !(eventTarget instanceof Node)) {
        return false;
      }
      return container.contains(eventTarget);
    },
    [yearsScrollContainerRef]
  );

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (event.touches.length === 0) return;

      const isFromScrollContainer = isEventFromScrollContainer(event.target);

      touchDragActiveRef.current = true;
      const touch = event.touches[0];
      touchStartPositionRef.current = { x: touch.clientX, y: touch.clientY };
      updateHoverFromTouch(touch);

      if (isFromScrollContainer) {
        markUserInteracted();
      }
    },
    [isEventFromScrollContainer, markUserInteracted, touchDragActiveRef, updateHoverFromTouch]
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!touchDragActiveRef.current || event.touches.length === 0) return;

      const isFromScrollContainer = isEventFromScrollContainer(event.target);

      const touch = event.touches[0];
      const startPosition = touchStartPositionRef.current;
      if (startPosition) {
        const deltaX = Math.abs(touch.clientX - startPosition.x);
        const deltaY = Math.abs(touch.clientY - startPosition.y);
        const nativeEvent = event.nativeEvent;
        if (deltaX > deltaY && nativeEvent.cancelable && !nativeEvent.defaultPrevented) {
          nativeEvent.preventDefault();
        }
      }

      updateHoverFromTouch(touch);

      if (isFromScrollContainer) {
        markUserInteracted();
      }
    },
    [isEventFromScrollContainer, markUserInteracted, touchDragActiveRef, updateHoverFromTouch]
  );

  const resetTouchState = useCallback(() => {
    touchDragActiveRef.current = false;
    setTouchCursorPosition(null);
    pointerPositionRef.current = null;
    touchStartPositionRef.current = null;
    lastTouchInfoRef.current = null;
    lastTouchYearIndexRef.current = null;
    setInitialOverlayTouch(null);
  }, [pointerPositionRef, touchDragActiveRef]);

  const handleTouchEnd = useCallback(() => {
    resetTouchState();
    stopAutoScroll();
  }, [resetTouchState, stopAutoScroll]);

  const handleTouchCancel = useCallback(() => {
    resetTouchState();
    stopAutoScroll();
  }, [resetTouchState, stopAutoScroll]);

  useEffect(() => {
    const wasVisible = overlayVisibilityRef.current;
    if (megaOverlayVisible && !wasVisible) {
      if (touchDragActiveRef.current && lastTouchInfoRef.current) {
        setInitialOverlayTouch({
          clientX: lastTouchInfoRef.current.clientX,
          clientY: lastTouchInfoRef.current.clientY,
          identifier: lastTouchInfoRef.current.identifier,
          sequence: Date.now(),
        });
      } else {
        setInitialOverlayTouch(null);
      }
    } else if (!megaOverlayVisible && wasVisible) {
      setInitialOverlayTouch(null);
    }
    overlayVisibilityRef.current = megaOverlayVisible;
  }, [megaOverlayVisible, touchDragActiveRef]);

  return useMemo(
    () => ({
      touchCursorPosition,
      initialOverlayTouch,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      handleTouchCancel,
    }),
    [
      handleTouchCancel,
      handleTouchEnd,
      handleTouchMove,
      handleTouchStart,
      initialOverlayTouch,
      touchCursorPosition,
    ]
  );
};

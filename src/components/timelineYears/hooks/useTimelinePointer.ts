import { MutableRefObject, RefObject, useCallback, useMemo, useRef } from "react";

type Point = { x: number; y: number };

type UseTimelinePointerOptions = {
  yearsScrollContainerRef: RefObject<HTMLDivElement>;
  touchDragActiveRef: MutableRefObject<boolean>;
  isTouchDevice: boolean;
  markUserInteracted: () => void;
  stopAutoScroll: () => void;
  updateEdgeScrollFromPointer: (clientX: number, hasActivePointer: boolean) => void;
};

type UseTimelinePointerResult = {
  pointerPositionRef: MutableRefObject<Point | null>;
  updateAutoScrollFromPointer: (clientX: number) => void;
  handleMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseUp: () => void;
  handleMouseLeave: () => void;
};

export const useTimelinePointer = ({
  yearsScrollContainerRef,
  touchDragActiveRef,
  isTouchDevice,
  markUserInteracted,
  stopAutoScroll,
  updateEdgeScrollFromPointer,
}: UseTimelinePointerOptions): UseTimelinePointerResult => {
  const pointerDownRef = useRef(false);
  const pointerPositionRef = useRef<Point | null>(null);

  const updateAutoScrollFromPointer = useCallback(
    (clientX: number) => {
      const hasActivePointer =
        touchDragActiveRef.current || pointerDownRef.current || pointerPositionRef.current !== null;

      updateEdgeScrollFromPointer(clientX, hasActivePointer);
    },
    [touchDragActiveRef, updateEdgeScrollFromPointer]
  );

  const isFromScrollContainer = useCallback(
    (eventTarget: EventTarget | null) => {
      const container = yearsScrollContainerRef.current;
      if (!container || !(eventTarget instanceof Node)) {
        return false;
      }
      return container.contains(eventTarget);
    },
    [yearsScrollContainerRef]
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isTouchDevice) return;
      if (event.button !== 0) return;

      const fromScrollContainer = isFromScrollContainer(event.target);

      pointerDownRef.current = true;
      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
      updateAutoScrollFromPointer(event.clientX);

      if (fromScrollContainer) {
        markUserInteracted();
      }
    },
    [isTouchDevice, isFromScrollContainer, markUserInteracted, updateAutoScrollFromPointer]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isTouchDevice) return;

      const fromScrollContainer = isFromScrollContainer(event.target);

      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
      updateAutoScrollFromPointer(event.clientX);

      if (fromScrollContainer) {
        markUserInteracted();
      }
    },
    [isTouchDevice, isFromScrollContainer, markUserInteracted, updateAutoScrollFromPointer]
  );

  const handleMouseUp = useCallback(() => {
    if (isTouchDevice) return;

    pointerDownRef.current = false;
    pointerPositionRef.current = null;
    stopAutoScroll();
  }, [isTouchDevice, stopAutoScroll]);

  const handleMouseLeave = useCallback(() => {
    if (!pointerDownRef.current) {
      stopAutoScroll();
    }
    pointerPositionRef.current = null;
  }, [stopAutoScroll]);

  return useMemo(
    () => ({
      pointerPositionRef,
      updateAutoScrollFromPointer,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleMouseLeave,
    }),
    [
      handleMouseDown,
      handleMouseLeave,
      handleMouseMove,
      handleMouseUp,
      pointerPositionRef,
      updateAutoScrollFromPointer,
    ]
  );
};

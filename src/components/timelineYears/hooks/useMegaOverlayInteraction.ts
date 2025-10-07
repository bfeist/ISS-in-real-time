import {
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
  TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MegaOverlayLayout } from "./useMegaOverlayLayout";
import { getMegaDateFromCoordinates } from "../subcomponents/megaYearOverlay.utils";

interface Position {
  left: number;
  top: number;
  width: number;
}

interface InitialTouch {
  clientX: number;
  clientY: number;
  identifier?: number;
  sequence: number;
}

interface UseMegaOverlayInteractionOptions {
  year: number;
  yearIndex: number;
  position: Position;
  startMonth: number;
  endMonth: number;
  isTouchDevice: boolean;
  layout: MegaOverlayLayout;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onSwitchToAdjacentYear?: (yearIndex: number) => void;
  handleDateClick: (dateStr: string) => void;
  containerRef: RefObject<HTMLDivElement>;
  setHoveredDate: (date: string | null) => void;
  hoveredDate: string | null;
  setShowTimelineYears: (value: boolean) => void;
  showTimelineYears: boolean;
  externalCursorPosition?: { x: number; y: number } | null;
  initialTouch?: InitialTouch | null;
}

interface UseMegaOverlayInteractionResult {
  cursorPosition: { x: number; y: number } | null;
  handleMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleMouseLeave: () => void;
  handleMouseEnter: () => void;
  handleTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => void;
  handleTouchMove: (event: ReactTouchEvent<HTMLDivElement>) => void;
  handleTouchEnd: (event: ReactTouchEvent<HTMLDivElement>) => void;
  handleTouchGo: (date?: string | null) => void;
  handleTouchCancel: () => void;
  handleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export const useMegaOverlayInteraction = (
  options: UseMegaOverlayInteractionOptions
): UseMegaOverlayInteractionResult => {
  const {
    year,
    yearIndex,
    position,
    startMonth,
    endMonth,
    isTouchDevice,
    layout,
    onMouseEnter,
    onMouseLeave,
    onSwitchToAdjacentYear,
    handleDateClick,
    containerRef,
    setHoveredDate,
    hoveredDate,
    setShowTimelineYears,
    showTimelineYears,
    externalCursorPosition,
    initialTouch,
  } = options;

  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingTouchDate, setPendingTouchDate] = useState<string | null>(null);

  const touchYOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const ignoreMouseEventsRef = useRef(false);
  const hoverClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastInitialTouchSequenceRef = useRef<number | null>(null);

  const checkHorizontalExtension = useCallback(
    (x: number) => {
      if (!onSwitchToAdjacentYear) {
        return false;
      }

      if (x < 0 && x >= -layout.horizontalExtensionWidth) {
        onSwitchToAdjacentYear(yearIndex - 1);
        return true;
      }

      if (x >= position.width && x < position.width + layout.horizontalExtensionWidth) {
        onSwitchToAdjacentYear(yearIndex + 1);
        return true;
      }

      return false;
    },
    [layout.horizontalExtensionWidth, onSwitchToAdjacentYear, position.width, yearIndex]
  );

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (ignoreMouseEventsRef.current || isTouchDevice) {
        ignoreMouseEventsRef.current = false;
        return;
      }

      const overlay = event.currentTarget;
      const rect = overlay.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const adjustedX = isTouchDevice ? x - layout.horizontalExtensionWidth : x;

      if (isTouchDevice && checkHorizontalExtension(adjustedX)) {
        return;
      }

      const dateStr = getMegaDateFromCoordinates(
        adjustedX,
        y,
        year,
        position.width,
        startMonth,
        endMonth
      );

      if (dateStr && hoveredDate !== dateStr) {
        setHoveredDate(dateStr);
      }

      setCursorPosition({ x: event.clientX, y: event.clientY });

      const nativeEvent = event.nativeEvent as MouseEvent & {
        sourceCapabilities?: { firesTouchEvents?: boolean };
      };

      if (nativeEvent.sourceCapabilities?.firesTouchEvents) {
        return;
      }
    },
    [
      checkHorizontalExtension,
      endMonth,
      hoveredDate,
      isTouchDevice,
      layout.horizontalExtensionWidth,
      position.width,
      setHoveredDate,
      startMonth,
      year,
    ]
  );

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();
      isDraggingRef.current = false;
      ignoreMouseEventsRef.current = true;

      const container = containerRef.current;
      if (!container || event.touches.length === 0) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const touch = event.touches[0];
      const rawX = touch.clientX - rect.left;
      const rawY = touch.clientY - rect.top;

      const adjustedX = rawX - layout.horizontalExtensionWidth;

      if (checkHorizontalExtension(adjustedX)) {
        return;
      }

      touchYOffsetRef.current = Math.min(rawY, layout.touchVerticalOffset);

      const adjustedY = Math.min(
        Math.max(rawY - touchYOffsetRef.current, 0),
        layout.totalHeight - 1
      );
      const dateStr = getMegaDateFromCoordinates(
        adjustedX,
        adjustedY,
        year,
        position.width,
        startMonth,
        endMonth
      );

      if (dateStr) {
        setHoveredDate(dateStr);
      }

      setCursorPosition({ x: touch.clientX, y: touch.clientY - touchYOffsetRef.current });
    },
    [
      checkHorizontalExtension,
      containerRef,
      endMonth,
      layout.horizontalExtensionWidth,
      layout.touchVerticalOffset,
      layout.totalHeight,
      position.width,
      setHoveredDate,
      startMonth,
      year,
    ]
  );

  const handleTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();
      isDraggingRef.current = true;
      if (event.touches.length === 0) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const touch = event.touches[0];
      const x = touch.clientX - rect.left;
      const rawY = touch.clientY - rect.top;

      const adjustedX = x - layout.horizontalExtensionWidth;

      if (checkHorizontalExtension(adjustedX)) {
        return;
      }

      const adjustedY = Math.min(
        Math.max(rawY - touchYOffsetRef.current, 0),
        layout.totalHeight - 1
      );
      const dateStr = getMegaDateFromCoordinates(
        adjustedX,
        adjustedY,
        year,
        position.width,
        startMonth,
        endMonth
      );

      if (dateStr) {
        setHoveredDate(dateStr);
      }

      setCursorPosition({ x: touch.clientX, y: touch.clientY - touchYOffsetRef.current });

      ignoreMouseEventsRef.current = true;
    },
    [
      checkHorizontalExtension,
      containerRef,
      endMonth,
      layout.horizontalExtensionWidth,
      layout.totalHeight,
      position.width,
      setHoveredDate,
      startMonth,
      year,
    ]
  );

  const handleTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (event.changedTouches.length > 0) {
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const touch = event.changedTouches[0];
          const rawY = touch.clientY - rect.top;
          const x = touch.clientX - rect.left;

          const adjustedX = x - layout.horizontalExtensionWidth;
          const adjustedY = Math.min(
            Math.max(rawY - touchYOffsetRef.current, 0),
            layout.totalHeight - 1
          );
          const dateStr = getMegaDateFromCoordinates(
            adjustedX,
            adjustedY,
            year,
            position.width,
            startMonth,
            endMonth
          );

          if (dateStr) {
            setHoveredDate(dateStr);
          }

          setCursorPosition({ x: touch.clientX, y: touch.clientY - touchYOffsetRef.current });
        }
      }

      if (!pendingTouchDate && hoveredDate) {
        setPendingTouchDate(hoveredDate);
      }

      ignoreMouseEventsRef.current = true;
    },
    [
      containerRef,
      endMonth,
      hoveredDate,
      layout.horizontalExtensionWidth,
      layout.totalHeight,
      pendingTouchDate,
      position.width,
      setHoveredDate,
      startMonth,
      year,
    ]
  );

  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isTouchDevice) {
        return;
      }

      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        return;
      }

      const overlay = event.currentTarget;
      const rect = overlay.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const adjustedX = isTouchDevice ? x - layout.horizontalExtensionWidth : x;

      const dateStr = getMegaDateFromCoordinates(
        adjustedX,
        y,
        year,
        position.width,
        startMonth,
        endMonth
      );

      if (dateStr) {
        handleDateClick(dateStr);
      }

      setShowTimelineYears(false);
    },
    [
      endMonth,
      handleDateClick,
      isTouchDevice,
      layout.horizontalExtensionWidth,
      position.width,
      setShowTimelineYears,
      startMonth,
      year,
    ]
  );

  const handleTouchGo = useCallback(
    (date?: string | null) => {
      const dateToSelect = date ?? pendingTouchDate ?? hoveredDate;

      if (!dateToSelect) {
        return;
      }

      handleDateClick(dateToSelect);
      setPendingTouchDate(null);
      setHoveredDate(null);
      setCursorPosition(null);
      setShowTimelineYears(false);
      touchYOffsetRef.current = 0;
      ignoreMouseEventsRef.current = false;
    },
    [handleDateClick, hoveredDate, pendingTouchDate, setHoveredDate, setShowTimelineYears]
  );

  const handleTouchCancel = useCallback(() => {
    setPendingTouchDate(null);
    setCursorPosition(null);
    touchYOffsetRef.current = 0;
    ignoreMouseEventsRef.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isTouchDevice) {
      return;
    }

    if (hoverClearTimeoutRef.current) {
      clearTimeout(hoverClearTimeoutRef.current);
    }

    hoverClearTimeoutRef.current = setTimeout(() => {
      setHoveredDate(null);
      setCursorPosition(null);
      onMouseLeave?.();
      hoverClearTimeoutRef.current = null;
    }, 50);
  }, [isTouchDevice, onMouseLeave, setHoveredDate]);

  const handleMouseEnter = useCallback(() => {
    if (isTouchDevice) {
      return;
    }

    if (hoverClearTimeoutRef.current) {
      clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }

    onMouseEnter?.();
  }, [isTouchDevice, onMouseEnter]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  useEffect(() => {
    return () => {
      if (hoverClearTimeoutRef.current) {
        clearTimeout(hoverClearTimeoutRef.current);
        hoverClearTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (externalCursorPosition) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const rawX = externalCursorPosition.x - rect.left;
        const rawY = externalCursorPosition.y - rect.top;
        const adjustedX = rawX - layout.horizontalExtensionWidth;
        const adjustedY = Math.min(
          Math.max(rawY - touchYOffsetRef.current, 0),
          layout.totalHeight - 1
        );

        const dateStr = getMegaDateFromCoordinates(
          adjustedX,
          adjustedY,
          year,
          position.width,
          startMonth,
          endMonth
        );

        if (dateStr && hoveredDate !== dateStr) {
          setHoveredDate(dateStr);
        }

        setCursorPosition({
          x: externalCursorPosition.x,
          y: externalCursorPosition.y - touchYOffsetRef.current,
        });
      }
      return;
    }

    if (!pendingTouchDate && !hoveredDate && isTouchDevice) {
      setCursorPosition(null);
    }
  }, [
    containerRef,
    endMonth,
    externalCursorPosition,
    hoveredDate,
    isTouchDevice,
    layout.horizontalExtensionWidth,
    layout.totalHeight,
    pendingTouchDate,
    position.width,
    setHoveredDate,
    startMonth,
    year,
  ]);

  useEffect(() => {
    if (!initialTouch || !showTimelineYears) {
      return;
    }

    if (lastInitialTouchSequenceRef.current === initialTouch.sequence) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    lastInitialTouchSequenceRef.current = initialTouch.sequence;

    const rect = container.getBoundingClientRect();
    const rawX = initialTouch.clientX - rect.left;
    const rawY = initialTouch.clientY - rect.top;

    const adjustedX = rawX - layout.horizontalExtensionWidth;

    touchYOffsetRef.current = Math.min(rawY, layout.touchVerticalOffset);

    const adjustedY = Math.min(Math.max(rawY - touchYOffsetRef.current, 0), layout.totalHeight - 1);
    const dateStr = getMegaDateFromCoordinates(
      adjustedX,
      adjustedY,
      year,
      position.width,
      startMonth,
      endMonth
    );

    if (dateStr) {
      setHoveredDate(dateStr);
    }

    setCursorPosition({
      x: initialTouch.clientX,
      y: initialTouch.clientY - touchYOffsetRef.current,
    });
    ignoreMouseEventsRef.current = true;
  }, [
    containerRef,
    endMonth,
    initialTouch,
    layout.horizontalExtensionWidth,
    layout.touchVerticalOffset,
    layout.totalHeight,
    position.width,
    setHoveredDate,
    showTimelineYears,
    startMonth,
    year,
  ]);

  return {
    cursorPosition,
    handleMouseMove,
    handleMouseLeave,
    handleMouseEnter,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchGo,
    handleTouchCancel,
    handleClick,
    handleKeyDown,
  };
};

import React, {
  forwardRef,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./megaYearOverlay.module.css";
import { useStateToggle } from "../../../store/hooks/useStateToggle";
import { useStateClock } from "../../../store/hooks/useStateClock";
import { useStateHover } from "../../../store/hooks/useStateHover";
import DateTooltip from "../dateTooltip/dateTooltip";
import { appSecondsFromDateTime } from "../../../utils/time";
import { COLORS } from "./yearCanvas";
import {
  MEGA_OVERLAY_CELL_GAP,
  MEGA_OVERLAY_MAX_DAYS_IN_MONTH,
  getMegaDateFromCoordinates,
} from "./megaYearOverlay.utils";
import { isTouchLikeInteraction, type InteractionMode } from "../types";

const AUTO_SCROLL_FRAME_STEP_MS = 32;

type HorizontalScrollDirection = -1 | 0 | 1;

interface HighlightInfo {
  fill: string;
  stroke?: string;
  expedition?: boolean;
  notableDatetime?: string;
}

interface Position {
  left: number;
  top: number;
  width: number;
}

interface MegaOverlayLayout {
  cellGap: number;
  maxDaysInMonth: number;
  cellWidth: number;
  cellSize: number;
  totalHeight: number;
  touchVerticalOffset: number;
  touchExtensionHeight: number;
  interactiveHeight: number;
  horizontalExtensionWidth: number;
}

const useMegaOverlayLayout = (
  width: number,
  position: Position,
  parentContainerRef?: React.RefObject<HTMLDivElement>
): MegaOverlayLayout => {
  return useMemo(() => {
    const cellGap = MEGA_OVERLAY_CELL_GAP;
    const maxDaysInMonth = MEGA_OVERLAY_MAX_DAYS_IN_MONTH;
    const cellWidth = (width - (12 - 1) * cellGap) / 12;
    const cellSize = cellWidth;
    const totalHeight = maxDaysInMonth * (cellSize + cellGap);
    const touchVerticalOffset = Math.min(Math.max(cellSize * 2, 72), 140);
    const touchExtensionHeight = touchVerticalOffset + cellSize * 1.5;
    const interactiveHeight = totalHeight + touchExtensionHeight;
    let horizontalExtensionWidth = width * 0.25;

    if (parentContainerRef?.current && typeof window !== "undefined") {
      const parentRect = parentContainerRef.current.getBoundingClientRect();
      const overlayLeft = parentRect.left + position.left;
      const overlayRight = overlayLeft + width;

      const leftSpace = Math.max(overlayLeft, 0);
      const rightSpace = Math.max(window.innerWidth - overlayRight, 0);

      horizontalExtensionWidth = Math.max(horizontalExtensionWidth, leftSpace, rightSpace);
    }

    return {
      cellGap,
      maxDaysInMonth,
      cellWidth,
      cellSize,
      totalHeight,
      touchVerticalOffset,
      touchExtensionHeight,
      interactiveHeight,
      horizontalExtensionWidth,
    };
  }, [parentContainerRef, position.left, width]);
};

interface UseMegaOverlayCanvasOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  layout: MegaOverlayLayout;
  year: number;
  width: number;
  startMonth: number;
  endMonth: number;
  highlights: Map<string, HighlightInfo>;
  selectedDate?: string | null;
  hoveredDate?: string | null;
  forceRedraw?: number;
}

const drawMegaOverlay = ({
  canvasRef,
  layout,
  year,
  width,
  startMonth,
  endMonth,
  highlights,
  selectedDate,
  hoveredDate,
}: UseMegaOverlayCanvasOptions): void => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const devicePixelRatio = window.devicePixelRatio || 1;

  canvas.width = width * devicePixelRatio;
  canvas.height = layout.totalHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  ctx.clearRect(0, 0, width, layout.totalHeight);

  for (let day = 1; day <= layout.maxDaysInMonth; day++) {
    const y = (day - 1) * (layout.cellSize + layout.cellGap);

    for (let month = startMonth; month <= endMonth; month++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      if (day > daysInMonth) {
        continue;
      }

      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const x = month * (layout.cellWidth + layout.cellGap);

      const highlightInfo = highlights.get(dateStr);
      const fillColor = highlightInfo?.fill || COLORS.noData;
      const strokeColor = highlightInfo?.stroke;
      const hasExpedition = highlightInfo?.expedition;

      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, layout.cellWidth, layout.cellSize);

      if (strokeColor) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, layout.cellWidth, layout.cellSize);
      }

      if (dateStr === selectedDate) {
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, layout.cellWidth, layout.cellSize);
      }

      if (dateStr === hoveredDate) {
        ctx.strokeStyle = COLORS.hover;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, layout.cellWidth, layout.cellSize);
      }

      if (hasExpedition) {
        const centerX = x + layout.cellWidth / 2;
        const centerY = y + layout.cellSize / 2;
        const dotRadius = Math.min(layout.cellWidth, layout.cellSize) * 0.25;

        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(centerX, centerY, dotRadius, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
};

const useMegaOverlayCanvas = (options: UseMegaOverlayCanvasOptions): void => {
  const {
    canvasRef,
    layout,
    year,
    width,
    startMonth,
    endMonth,
    highlights,
    selectedDate,
    hoveredDate,
    forceRedraw,
  } = options;

  const draw = useCallback(() => {
    drawMegaOverlay({
      canvasRef,
      layout,
      year,
      width,
      startMonth,
      endMonth,
      highlights,
      selectedDate,
      hoveredDate,
    });
  }, [canvasRef, layout, year, width, startMonth, endMonth, highlights, selectedDate, hoveredDate]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (forceRedraw !== undefined) {
      draw();
    }
  }, [forceRedraw, draw]);
};

interface UseMegaOverlayInteractionOptions {
  year: number;
  yearIndex: number;
  position: Position;
  startMonth: number;
  endMonth: number;
  isTouchDevice: boolean;
  onInteractionModeChange: (mode: InteractionMode) => void;
  layout: MegaOverlayLayout;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onSwitchToAdjacentYear?: (yearIndex: number) => void;
  handleDateClick: (dateStr: string) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  setHoveredDate: (date: string | null) => void;
  hoveredDate: string | null;
  setShowTimelineYears: (value: boolean) => void;
}

interface UseMegaOverlayInteractionResult {
  cursorPosition: { x: number; y: number } | null;
  activeTouchId: React.MutableRefObject<number | null>;
  handleMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleMouseLeave: () => void;
  handleMouseEnter: () => void;
  handleExternalTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => void;
  handleTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => void;
  handleTouchMove: (event: ReactTouchEvent<HTMLDivElement> | TouchEvent) => void;
  handleTouchEnd: (event: ReactTouchEvent<HTMLDivElement> | TouchEvent) => void;
  handleTouchGo: (date?: string | null) => void;
  handleTouchCancel: () => void;
  handleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

const toNativeTouchEvent = (event: ReactTouchEvent<HTMLDivElement> | TouchEvent): TouchEvent =>
  "nativeEvent" in event ? (event.nativeEvent as TouchEvent) : event;

const useMegaOverlayInteraction = (
  options: UseMegaOverlayInteractionOptions
): UseMegaOverlayInteractionResult => {
  const {
    year,
    yearIndex,
    position,
    startMonth,
    endMonth,
    isTouchDevice,
    onInteractionModeChange,
    layout,
    onMouseEnter,
    onMouseLeave,
    onSwitchToAdjacentYear,
    handleDateClick,
    containerRef,
    setHoveredDate,
    hoveredDate,
    setShowTimelineYears,
  } = options;

  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingTouchDate, setPendingTouchDate] = useState<string | null>(null);

  const activeTouchId = useRef<number | null>(null);
  const touchYOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const ignoreMouseEventsRef = useRef(false);
  const hoverClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPointerClientXRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const lastAutoScrollTimestampRef = useRef<number | null>(null);
  const autoScrollDirectionRef = useRef<HorizontalScrollDirection>(0);
  const lastImmediateDirectionRef = useRef<HorizontalScrollDirection>(0);
  const latestYearIndexRef = useRef(yearIndex);

  useEffect(() => {
    latestYearIndexRef.current = yearIndex;
  }, [yearIndex]);

  const stopAutoScroll = useCallback(() => {
    autoScrollDirectionRef.current = 0;
    lastImmediateDirectionRef.current = 0;
    lastAutoScrollTimestampRef.current = null;
    lastPointerClientXRef.current = null;

    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, []);

  const getAdjustedXFromClientX = useCallback(
    (clientX: number | null) => {
      if (clientX === null) {
        return null;
      }

      const container = containerRef.current;
      if (!container) {
        return null;
      }

      const rect = container.getBoundingClientRect();
      return clientX - rect.left - layout.horizontalExtensionWidth;
    },
    [containerRef, layout.horizontalExtensionWidth]
  );

  const getHorizontalScrollDirection = useCallback(
    (x: number): HorizontalScrollDirection => {
      if (!onSwitchToAdjacentYear) {
        return 0;
      }

      if (x < 0 && x >= -layout.horizontalExtensionWidth) {
        return -1;
      }

      if (x >= position.width && x < position.width + layout.horizontalExtensionWidth) {
        return 1;
      }

      return 0;
    },
    [layout.horizontalExtensionWidth, onSwitchToAdjacentYear, position.width]
  );

  const updateAutoScrollDirection = useCallback(() => {
    const adjustedX = getAdjustedXFromClientX(lastPointerClientXRef.current);
    if (adjustedX === null) {
      return autoScrollDirectionRef.current;
    }

    const newDirection = getHorizontalScrollDirection(adjustedX);
    if (newDirection !== autoScrollDirectionRef.current) {
      if (newDirection === 0) {
        stopAutoScroll();
        return 0;
      }

      autoScrollDirectionRef.current = newDirection;
      lastAutoScrollTimestampRef.current = null;
    }

    return autoScrollDirectionRef.current;
  }, [getAdjustedXFromClientX, getHorizontalScrollDirection, stopAutoScroll]);

  const autoScrollStep = useCallback(
    function step(timestamp: number) {
      autoScrollFrameRef.current = null;

      if (!onSwitchToAdjacentYear) {
        return;
      }

      const direction = updateAutoScrollDirection();
      if (direction === 0) {
        return;
      }

      let lastTimestamp = lastAutoScrollTimestampRef.current;
      if (lastTimestamp === null) {
        lastAutoScrollTimestampRef.current = timestamp;
        lastTimestamp = timestamp;
      }

      if (timestamp - lastTimestamp >= AUTO_SCROLL_FRAME_STEP_MS) {
        const nextIndex =
          direction > 0 ? latestYearIndexRef.current + 1 : latestYearIndexRef.current - 1;
        latestYearIndexRef.current = nextIndex;
        onSwitchToAdjacentYear(nextIndex);
        lastAutoScrollTimestampRef.current = timestamp;
      }

      if (autoScrollFrameRef.current === null) {
        autoScrollFrameRef.current = window.requestAnimationFrame(step);
      }
    },
    [onSwitchToAdjacentYear, updateAutoScrollDirection]
  );

  const startAutoScroll = useCallback(
    (direction: HorizontalScrollDirection) => {
      if (!onSwitchToAdjacentYear) {
        return;
      }

      if (autoScrollDirectionRef.current !== direction) {
        lastAutoScrollTimestampRef.current = null;
      }

      autoScrollDirectionRef.current = direction;

      if (autoScrollFrameRef.current === null) {
        autoScrollFrameRef.current = window.requestAnimationFrame(autoScrollStep);
      }
    },
    [autoScrollStep, onSwitchToAdjacentYear]
  );

  const handleHorizontalScrollZone = useCallback(
    (direction: HorizontalScrollDirection) => {
      if (!onSwitchToAdjacentYear) {
        stopAutoScroll();
        return false;
      }

      if (direction === 0) {
        stopAutoScroll();
        return false;
      }

      startAutoScroll(direction);

      if (lastImmediateDirectionRef.current !== direction) {
        lastImmediateDirectionRef.current = direction;
        const nextIndex =
          direction > 0 ? latestYearIndexRef.current + 1 : latestYearIndexRef.current - 1;
        latestYearIndexRef.current = nextIndex;
        lastAutoScrollTimestampRef.current = null;
        onSwitchToAdjacentYear(nextIndex);
      }

      return true;
    },
    [onSwitchToAdjacentYear, startAutoScroll, stopAutoScroll]
  );

  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (ignoreMouseEventsRef.current) {
        ignoreMouseEventsRef.current = false;
        return;
      }

      const nativeEvent = event.nativeEvent as MouseEvent & {
        sourceCapabilities?: { firesTouchEvents?: boolean };
      };

      if (nativeEvent.sourceCapabilities?.firesTouchEvents) {
        ignoreMouseEventsRef.current = true;
        return;
      }

      onInteractionModeChange("mouse");

      const overlay = event.currentTarget;
      const rect = overlay.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const adjustedX = x - layout.horizontalExtensionWidth;

      lastPointerClientXRef.current = event.clientX;

      const direction = getHorizontalScrollDirection(adjustedX);
      if (handleHorizontalScrollZone(direction)) {
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
    },
    [
      getHorizontalScrollDirection,
      handleHorizontalScrollZone,
      endMonth,
      hoveredDate,
      layout.horizontalExtensionWidth,
      onInteractionModeChange,
      position.width,
      setHoveredDate,
      startMonth,
      year,
    ]
  );

  const handleExternalTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (event.touches.length === 0) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      onInteractionModeChange("touch");

      const touch = event.touches[0];
      activeTouchId.current = touch.identifier;

      const rect = container.getBoundingClientRect();
      const rawX = touch.clientX - rect.left;
      const rawY = touch.clientY - rect.top;
      const adjustedX = rawX - layout.horizontalExtensionWidth;

      lastPointerClientXRef.current = touch.clientX;

      const direction = getHorizontalScrollDirection(adjustedX);
      if (handleHorizontalScrollZone(direction)) {
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
      isDraggingRef.current = false;
      ignoreMouseEventsRef.current = true;
    },
    [
      getHorizontalScrollDirection,
      handleHorizontalScrollZone,
      containerRef,
      endMonth,
      layout.horizontalExtensionWidth,
      layout.touchVerticalOffset,
      layout.totalHeight,
      onInteractionModeChange,
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

      if (activeTouchId.current !== null) {
        return;
      }

      isDraggingRef.current = false;
      ignoreMouseEventsRef.current = true;

      const container = containerRef.current;
      if (!container || event.touches.length === 0) {
        return;
      }

      onInteractionModeChange("touch");

      const touch = event.touches[0];
      activeTouchId.current = touch.identifier;

      const rect = container.getBoundingClientRect();
      const rawX = touch.clientX - rect.left;
      const rawY = touch.clientY - rect.top;
      const adjustedX = rawX - layout.horizontalExtensionWidth;

      lastPointerClientXRef.current = touch.clientX;

      const direction = getHorizontalScrollDirection(adjustedX);
      if (handleHorizontalScrollZone(direction)) {
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
      getHorizontalScrollDirection,
      handleHorizontalScrollZone,
      containerRef,
      endMonth,
      layout.horizontalExtensionWidth,
      layout.touchVerticalOffset,
      layout.totalHeight,
      onInteractionModeChange,
      position.width,
      setHoveredDate,
      startMonth,
      year,
    ]
  );

  const handleTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement> | TouchEvent) => {
      event.stopPropagation();
      event.preventDefault();

      const nativeEvent = toNativeTouchEvent(event);
      const touch = Array.from(nativeEvent.touches).find(
        (t) => t.identifier === activeTouchId.current
      );

      if (!touch) {
        return;
      }

      isDraggingRef.current = true;

      const container = containerRef.current;
      if (!container) {
        return;
      }

      onInteractionModeChange("touch");

      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const rawY = touch.clientY - rect.top;
      const adjustedX = x - layout.horizontalExtensionWidth;

      lastPointerClientXRef.current = touch.clientX;

      const direction = getHorizontalScrollDirection(adjustedX);
      if (handleHorizontalScrollZone(direction)) {
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
      getHorizontalScrollDirection,
      handleHorizontalScrollZone,
      containerRef,
      endMonth,
      layout.horizontalExtensionWidth,
      layout.totalHeight,
      onInteractionModeChange,
      position.width,
      setHoveredDate,
      startMonth,
      year,
    ]
  );

  const handleTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement> | TouchEvent) => {
      event.stopPropagation();

      const nativeEvent = toNativeTouchEvent(event);
      const touch = Array.from(nativeEvent.changedTouches).find(
        (t) => t.identifier === activeTouchId.current
      );

      if (!touch) {
        return;
      }

      const container = containerRef.current;
      if (container) {
        onInteractionModeChange("touch");
        const rect = container.getBoundingClientRect();
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

      if (!pendingTouchDate && hoveredDate) {
        setPendingTouchDate(hoveredDate);
      }

      stopAutoScroll();
      activeTouchId.current = null;
      ignoreMouseEventsRef.current = true;
    },
    [
      containerRef,
      endMonth,
      hoveredDate,
      layout.horizontalExtensionWidth,
      layout.totalHeight,
      onInteractionModeChange,
      pendingTouchDate,
      position.width,
      setHoveredDate,
      startMonth,
      stopAutoScroll,
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

      onInteractionModeChange("mouse");

      const overlay = event.currentTarget;
      const rect = overlay.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const adjustedX = x - layout.horizontalExtensionWidth;

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

      stopAutoScroll();
      setShowTimelineYears(false);
    },
    [
      endMonth,
      handleDateClick,
      isTouchDevice,
      layout.horizontalExtensionWidth,
      onInteractionModeChange,
      position.width,
      setShowTimelineYears,
      startMonth,
      stopAutoScroll,
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
      onInteractionModeChange("touch");
      setPendingTouchDate(null);
      setHoveredDate(null);
      setCursorPosition(null);
      setShowTimelineYears(false);
      touchYOffsetRef.current = 0;
      ignoreMouseEventsRef.current = false;
      stopAutoScroll();
    },
    [
      handleDateClick,
      hoveredDate,
      onInteractionModeChange,
      pendingTouchDate,
      setHoveredDate,
      setShowTimelineYears,
      stopAutoScroll,
    ]
  );

  const handleTouchCancel = useCallback(() => {
    activeTouchId.current = null;
    setPendingTouchDate(null);
    setCursorPosition(null);
    touchYOffsetRef.current = 0;
    ignoreMouseEventsRef.current = false;
    onInteractionModeChange("touch");
    stopAutoScroll();
  }, [onInteractionModeChange, stopAutoScroll]);

  const handleMouseLeave = useCallback(() => {
    if (isTouchDevice) {
      return;
    }

    stopAutoScroll();

    if (hoverClearTimeoutRef.current) {
      clearTimeout(hoverClearTimeoutRef.current);
    }

    hoverClearTimeoutRef.current = setTimeout(() => {
      setHoveredDate(null);
      setCursorPosition(null);
      onMouseLeave?.();
      hoverClearTimeoutRef.current = null;
    }, 50);
  }, [isTouchDevice, onMouseLeave, setHoveredDate, stopAutoScroll]);

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

  return {
    cursorPosition,
    activeTouchId,
    handleMouseMove,
    handleMouseLeave,
    handleMouseEnter,
    handleExternalTouchStart,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchGo,
    handleTouchCancel,
    handleClick,
    handleKeyDown,
  };
};

export interface MegaYearOverlayHandle {
  handleExternalTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => void;
}

interface MegaYearOverlayProps {
  year: number;
  yearIndex: number;
  position: { left: number; top: number; width: number };
  highlights: Map<string, HighlightInfo>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onSwitchToAdjacentYear?: (yearIndex: number) => void;
  forceRedraw?: number;
  startMonth?: number; // 0-based month index (0 = January)
  endMonth?: number; // 0-based month index (11 = December)
  selectedDate?: string | null;
  interactionMode: InteractionMode;
  onInteractionModeChange: (mode: InteractionMode) => void;
  parentContainerRef?: React.RefObject<HTMLDivElement>;
}

// Mega Overlay Component for zoomed year view
const MegaYearOverlay = forwardRef<MegaYearOverlayHandle, MegaYearOverlayProps>(
  (
    {
      year,
      yearIndex,
      position,
      highlights,
      onMouseEnter,
      onMouseLeave,
      onSwitchToAdjacentYear,
      forceRedraw,
      startMonth = 0, // Default to January
      endMonth = 11, // Default to December
      selectedDate,
      interactionMode,
      onInteractionModeChange,
      parentContainerRef,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const calendarContentRef = useRef<HTMLDivElement>(null);

    const { hoveredDate, setHoveredDate } = useStateHover();
    const { setSelectedDate, setClock } = useStateClock();
    const { showTimelineYears, setShowTimelineYears } = useStateToggle();

    const isTouchDevice = isTouchLikeInteraction(interactionMode);

    const layout = useMegaOverlayLayout(position.width, position, parentContainerRef);

    // Handle date click using global state with touch device logic
    const handleDateClick = useCallback(
      (dateStr: string) => {
        setSelectedDate(dateStr);

        // Check if this date has a Notable Moment item with a specific time
        const highlightInfo = highlights.get(dateStr);
        if (highlightInfo?.notableDatetime) {
          // Extract the time from the Notable Moment datetime and set the clock
          const appSeconds = appSecondsFromDateTime(highlightInfo.notableDatetime);
          if (appSeconds !== null) {
            setClock(appSeconds);
          }
        }
      },
      [setSelectedDate, setClock, highlights]
    );

    useMegaOverlayCanvas({
      canvasRef,
      layout,
      year,
      width: position.width,
      startMonth,
      endMonth,
      highlights,
      selectedDate,
      hoveredDate,
      forceRedraw,
    });

    const {
      cursorPosition,
      activeTouchId,
      handleMouseMove,
      handleMouseLeave,
      handleMouseEnter,
      handleExternalTouchStart,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      handleTouchGo,
      handleTouchCancel,
      handleClick,
      handleKeyDown,
    } = useMegaOverlayInteraction({
      year,
      yearIndex,
      position,
      startMonth,
      endMonth,
      isTouchDevice,
      onInteractionModeChange,
      layout,
      onMouseEnter,
      onMouseLeave,
      onSwitchToAdjacentYear,
      handleDateClick,
      containerRef,
      setHoveredDate,
      hoveredDate,
      setShowTimelineYears,
    });

    // Expose handle for external touch handoff
    useImperativeHandle(ref, () => ({
      handleExternalTouchStart,
    }));

    // Attach native touch listeners to parent container when we have an active touch
    // This allows us to receive touchmove events even when the touch started on timeline
    useEffect(() => {
      if (!parentContainerRef?.current || !isTouchDevice) {
        return;
      }

      const parentElement = parentContainerRef.current;

      const handleParentTouchMove = (event: TouchEvent) => {
        // Native TouchEvent can be passed directly to our handler
        handleTouchMove(event);
      };

      const handleParentTouchEnd = (event: TouchEvent) => {
        // Find if the ended touch is ours
        const touch = Array.from(event.changedTouches).find(
          (t) => t.identifier === activeTouchId.current
        );
        if (touch) {
          handleTouchEnd(event);
        }
      };

      const handleParentTouchCancel = (event: TouchEvent) => {
        const touch = Array.from(event.changedTouches).find(
          (t) => t.identifier === activeTouchId.current
        );
        if (touch) {
          handleTouchCancel();
        }
      };

      // Add listeners to parent
      parentElement.addEventListener("touchmove", handleParentTouchMove, { passive: false });
      parentElement.addEventListener("touchend", handleParentTouchEnd);
      parentElement.addEventListener("touchcancel", handleParentTouchCancel);

      return () => {
        parentElement.removeEventListener("touchmove", handleParentTouchMove);
        parentElement.removeEventListener("touchend", handleParentTouchEnd);
        parentElement.removeEventListener("touchcancel", handleParentTouchCancel);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parentContainerRef, isTouchDevice, handleTouchMove, handleTouchEnd, handleTouchCancel]);

    if (!showTimelineYears) {
      return null;
    }

    const containerStyle: React.CSSProperties = {
      position: "absolute",
      left: position.left - layout.horizontalExtensionWidth,
      top: position.top,
      width: position.width + layout.horizontalExtensionWidth * 2,
      height: isTouchDevice ? layout.interactiveHeight : layout.totalHeight,
      zIndex: 1100,
    };

    return (
      <div
        ref={containerRef}
        className={styles.touchZone}
        style={containerStyle}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={handleMouseEnter}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onTouchStart={isTouchDevice ? handleTouchStart : undefined}
        onTouchMove={
          isTouchDevice
            ? (event) => {
                handleTouchMove(event);
              }
            : undefined
        }
        onTouchEnd={
          isTouchDevice
            ? (event) => {
                handleTouchEnd(event);
              }
            : undefined
        }
        onTouchCancel={
          isTouchDevice
            ? (event) => {
                event.stopPropagation();
                handleTouchCancel();
              }
            : undefined
        }
        onContextMenu={
          isTouchDevice
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
              }
            : undefined
        }
        role="grid"
        tabIndex={0}
        aria-label={`Calendar for ${year}`}
      >
        <div
          className={styles.backdrop}
          style={{
            width: position.width + layout.horizontalExtensionWidth * 2,
            height: layout.totalHeight,
          }}
          aria-hidden="true"
        />
        <div
          className={styles.horizontalExtension}
          style={{ width: layout.horizontalExtensionWidth, height: layout.totalHeight }}
          aria-hidden="true"
        />
        <div
          ref={calendarContentRef}
          className={styles.yearOverlay}
          style={{ height: layout.totalHeight }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: `${position.width}px`,
              height: `${layout.totalHeight}px`,
              pointerEvents: "none",
            }}
          />
        </div>
        <div
          className={styles.horizontalExtension}
          style={{ width: layout.horizontalExtensionWidth, height: layout.totalHeight }}
          aria-hidden="true"
        />
        {isTouchDevice ? (
          <div
            className={styles.touchExtension}
            style={{ height: layout.touchExtensionHeight }}
            aria-hidden="true"
          />
        ) : null}
        <DateTooltip
          hoveredDate={hoveredDate}
          cursorPosition={cursorPosition}
          isTouchDevice={isTouchDevice}
          onTouchGo={handleTouchGo}
          onTouchCancel={handleTouchCancel}
          containerRef={calendarContentRef}
        />
      </div>
    );
  }
);

MegaYearOverlay.displayName = "MegaYearOverlay";

export { getMegaDateFromCoordinates } from "./megaYearOverlay.utils";

export default MegaYearOverlay;

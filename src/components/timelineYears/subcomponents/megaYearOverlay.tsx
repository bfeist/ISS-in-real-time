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
import {
  appSecondsFromDateTime,
  isBeforeTimelineStart,
  isDateStringBeforeTimelineStart,
} from "../../../utils/dateTime";
import { COLORS } from "./yearCanvas";
import {
  MEGA_OVERLAY_CELL_GAP,
  MEGA_OVERLAY_MAX_DAYS_IN_MONTH,
  getMegaDateFromCoordinates,
} from "./megaYearOverlay.utils";
import { isTouchLikeInteraction, type InteractionMode } from "../types";

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"] as const;

type TodayParts = {
  year: number;
  monthIndex: number;
  day: number;
};

const getTodayParts = (): TodayParts => {
  const now = new Date();
  return {
    // Align overlay rendering with UTC to match timeline expectations
    year: now.getUTCFullYear(),
    monthIndex: now.getUTCMonth(),
    day: now.getUTCDate(),
  };
};

const isAfterToday = (
  candidateYear: number,
  candidateMonthIndex: number,
  candidateDay: number,
  today: TodayParts
): boolean => {
  if (candidateYear > today.year) {
    return true;
  }

  if (candidateYear === today.year) {
    if (candidateMonthIndex > today.monthIndex) {
      return true;
    }

    if (candidateMonthIndex === today.monthIndex && candidateDay > today.day) {
      return true;
    }
  }

  return false;
};

const isDateStringInFuture = (dateStr: string, today = getTodayParts()): boolean => {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  if (!yearStr || !monthStr || !dayStr) {
    return false;
  }

  const year = Number.parseInt(yearStr, 10);
  const monthIndex = Number.parseInt(monthStr, 10) - 1;
  const day = Number.parseInt(dayStr, 10);

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
    return false;
  }

  return isAfterToday(year, monthIndex, day, today);
};

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
  headerHeight: number;
  gridOffsetY: number;
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
    const headerHeight = cellSize;
    const gridOffsetY = headerHeight + cellGap;
    const totalHeight = gridOffsetY + maxDaysInMonth * (cellSize + cellGap);
    const touchVerticalOffset = Math.min(Math.max(cellSize * 2, 55), 140);
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
      headerHeight,
      gridOffsetY,
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
  const today = getTodayParts();

  canvas.width = width * devicePixelRatio;
  canvas.height = layout.totalHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  ctx.clearRect(0, 0, width, layout.totalHeight);

  const headerFontSize = Math.max(Math.floor(layout.headerHeight * 0.6), 10);
  ctx.font = `600 ${headerFontSize}px/1 "Inter", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const canDrawText = typeof ctx.fillText === "function";

  for (let month = startMonth; month <= endMonth; month++) {
    const x = month * (layout.cellWidth + layout.cellGap);
    ctx.fillStyle = COLORS.noData;
    ctx.fillRect(x, 0, layout.cellWidth, layout.headerHeight);

    const label = MONTH_INITIALS[month] ?? "";
    if (label && canDrawText) {
      ctx.fillStyle = "#e0e0e0";
      ctx.fillText(label, x + layout.cellWidth / 2, layout.headerHeight / 2);
    }
  }

  for (let day = 1; day <= layout.maxDaysInMonth; day++) {
    const y = layout.gridOffsetY + (day - 1) * (layout.cellSize + layout.cellGap);

    for (let month = startMonth; month <= endMonth; month++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      if (day > daysInMonth) {
        continue;
      }

      if (isBeforeTimelineStart(year, month, day)) {
        continue;
      }

      if (isAfterToday(year, month, day, today)) {
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
  onRequestClose: () => void;
  parentContainerRef?: React.RefObject<HTMLDivElement>;
  onPointerUpdate?: (
    clientX: number | null,
    clientY: number | null,
    hasActivePointer: boolean
  ) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
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

interface PointerUpdatePayload {
  clientX: number | null;
  clientY?: number | null;
  hasActivePointer: boolean;
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
    onRequestClose,
    parentContainerRef,
    onPointerUpdate,
    scrollContainerRef,
  } = options;

  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingTouchDate, setPendingTouchDate] = useState<string | null>(null);

  const activeTouchId = useRef<number | null>(null);
  const touchYOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const ignoreMouseEventsRef = useRef(false);
  const hoverClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestYearIndexRef = useRef(yearIndex);
  const lastPointerInfoRef = useRef<PointerUpdatePayload>({
    clientX: null,
    clientY: null,
    hasActivePointer: false,
  });

  const notifyPointerUpdate = useCallback(
    ({ clientX, clientY, hasActivePointer }: PointerUpdatePayload) => {
      const normalizedClientX = clientX ?? null;
      const normalizedClientY =
        normalizedClientX === null ? null : (clientY ?? lastPointerInfoRef.current.clientY ?? null);

      lastPointerInfoRef.current = {
        clientX: normalizedClientX,
        clientY: normalizedClientY,
        hasActivePointer,
      };

      onPointerUpdate?.(normalizedClientX, normalizedClientY, hasActivePointer);
    },
    [onPointerUpdate]
  );

  useEffect(() => {
    latestYearIndexRef.current = yearIndex;
  }, [yearIndex]);

  const findTargetYearIndex = useCallback(
    (clientX: number) => {
      const parent = parentContainerRef?.current;
      if (!parent) {
        return null;
      }

      const yearElements = parent.querySelectorAll<HTMLElement>("[data-year-index]");
      let closestIndex: number | null = null;
      let smallestDistance = Number.POSITIVE_INFINITY;

      for (const element of Array.from(yearElements)) {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const distance = Math.abs(clientX - centerX);

        if (distance < smallestDistance) {
          const indexAttr = element.getAttribute("data-year-index");
          if (indexAttr !== null) {
            const parsed = Number(indexAttr);
            if (!Number.isNaN(parsed)) {
              smallestDistance = distance;
              closestIndex = parsed;
            }
          }
        }
      }

      return closestIndex;
    },
    [parentContainerRef]
  );

  const handleExtensionPointer = useCallback(
    (adjustedX: number, clientX: number) => {
      if (!onSwitchToAdjacentYear) {
        return false;
      }

      const inLeftExtension = adjustedX < 0 && adjustedX >= -layout.horizontalExtensionWidth;
      const inRightExtension =
        adjustedX >= position.width &&
        adjustedX <= position.width + layout.horizontalExtensionWidth;

      if (!inLeftExtension && !inRightExtension) {
        return false;
      }

      const targetYearIndex = findTargetYearIndex(clientX);
      if (targetYearIndex === null) {
        return true;
      }

      if (targetYearIndex !== latestYearIndexRef.current) {
        latestYearIndexRef.current = targetYearIndex;
        onSwitchToAdjacentYear(targetYearIndex);
      }

      return true;
    },
    [findTargetYearIndex, layout.horizontalExtensionWidth, onSwitchToAdjacentYear, position.width]
  );

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

      notifyPointerUpdate({
        clientX: event.clientX,
        clientY: event.clientY,
        hasActivePointer: true,
      });
      if (handleExtensionPointer(adjustedX, event.clientX)) {
        return;
      }

      const dateStr = getMegaDateFromCoordinates(
        adjustedX,
        y,
        year,
        position.width,
        startMonth,
        endMonth,
        {
          gridOffsetY: layout.gridOffsetY,
          cellGap: layout.cellGap,
          maxDaysInMonth: layout.maxDaysInMonth,
        }
      );

      if (!dateStr || isDateStringInFuture(dateStr) || isDateStringBeforeTimelineStart(dateStr)) {
        if (hoveredDate) {
          setHoveredDate(null);
        }
        setCursorPosition(null);
        return;
      }

      if (hoveredDate !== dateStr) {
        setHoveredDate(dateStr);
      }

      setCursorPosition({ x: event.clientX, y: event.clientY });
    },
    [
      handleExtensionPointer,
      endMonth,
      hoveredDate,
      layout.cellGap,
      layout.gridOffsetY,
      layout.maxDaysInMonth,
      layout.horizontalExtensionWidth,
      notifyPointerUpdate,
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

      notifyPointerUpdate({
        clientX: touch.clientX,
        clientY: touch.clientY,
        hasActivePointer: true,
      });
      if (handleExtensionPointer(adjustedX, touch.clientX)) {
        ignoreMouseEventsRef.current = true;
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
        endMonth,
        {
          gridOffsetY: layout.gridOffsetY,
          cellGap: layout.cellGap,
          maxDaysInMonth: layout.maxDaysInMonth,
        }
      );

      if (!dateStr || isDateStringInFuture(dateStr) || isDateStringBeforeTimelineStart(dateStr)) {
        setHoveredDate(null);
        setCursorPosition(null);
      } else {
        setHoveredDate(dateStr);
        setCursorPosition({ x: touch.clientX, y: touch.clientY - touchYOffsetRef.current });
      }

      isDraggingRef.current = false;
      ignoreMouseEventsRef.current = true;
      notifyPointerUpdate({
        clientX: touch.clientX,
        clientY: touch.clientY,
        hasActivePointer: true,
      });
    },
    [
      handleExtensionPointer,
      containerRef,
      endMonth,
      layout.cellGap,
      layout.gridOffsetY,
      layout.maxDaysInMonth,
      layout.horizontalExtensionWidth,
      layout.touchVerticalOffset,
      layout.totalHeight,
      notifyPointerUpdate,
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

      notifyPointerUpdate({
        clientX: touch.clientX,
        clientY: touch.clientY,
        hasActivePointer: true,
      });
      if (handleExtensionPointer(adjustedX, touch.clientX)) {
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
        endMonth,
        {
          gridOffsetY: layout.gridOffsetY,
          cellGap: layout.cellGap,
          maxDaysInMonth: layout.maxDaysInMonth,
        }
      );

      if (!dateStr || isDateStringInFuture(dateStr) || isDateStringBeforeTimelineStart(dateStr)) {
        setHoveredDate(null);
        setCursorPosition(null);
      } else {
        setHoveredDate(dateStr);
        setCursorPosition({ x: touch.clientX, y: touch.clientY - touchYOffsetRef.current });
      }
      notifyPointerUpdate({
        clientX: touch.clientX,
        clientY: touch.clientY,
        hasActivePointer: true,
      });
    },
    [
      handleExtensionPointer,
      containerRef,
      endMonth,
      layout.cellGap,
      layout.gridOffsetY,
      layout.maxDaysInMonth,
      layout.horizontalExtensionWidth,
      layout.touchVerticalOffset,
      layout.totalHeight,
      notifyPointerUpdate,
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

      notifyPointerUpdate({
        clientX: touch.clientX,
        clientY: touch.clientY,
        hasActivePointer: true,
      });
      if (handleExtensionPointer(adjustedX, touch.clientX)) {
        ignoreMouseEventsRef.current = true;
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
        endMonth,
        {
          gridOffsetY: layout.gridOffsetY,
          cellGap: layout.cellGap,
          maxDaysInMonth: layout.maxDaysInMonth,
        }
      );

      if (!dateStr || isDateStringInFuture(dateStr) || isDateStringBeforeTimelineStart(dateStr)) {
        setHoveredDate(null);
        setCursorPosition(null);
      } else {
        setHoveredDate(dateStr);
        setCursorPosition({ x: touch.clientX, y: touch.clientY - touchYOffsetRef.current });
      }
      ignoreMouseEventsRef.current = true;
      notifyPointerUpdate({
        clientX: touch.clientX,
        clientY: touch.clientY,
        hasActivePointer: true,
      });
    },
    [
      handleExtensionPointer,
      containerRef,
      endMonth,
      layout.cellGap,
      layout.gridOffsetY,
      layout.maxDaysInMonth,
      layout.horizontalExtensionWidth,
      layout.totalHeight,
      notifyPointerUpdate,
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

      let resolvedDate: string | null = null;

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
          endMonth,
          {
            gridOffsetY: layout.gridOffsetY,
            cellGap: layout.cellGap,
            maxDaysInMonth: layout.maxDaysInMonth,
          }
        );

        if (!dateStr || isDateStringInFuture(dateStr) || isDateStringBeforeTimelineStart(dateStr)) {
          setHoveredDate(null);
          setCursorPosition(null);
        } else {
          resolvedDate = dateStr;
          setHoveredDate(dateStr);
          setCursorPosition({ x: touch.clientX, y: touch.clientY - touchYOffsetRef.current });
        }

        notifyPointerUpdate({
          clientX: touch.clientX,
          clientY: touch.clientY,
          hasActivePointer: false,
        });
      }

      if (!pendingTouchDate && resolvedDate) {
        setPendingTouchDate(resolvedDate);
      }

      activeTouchId.current = null;
      ignoreMouseEventsRef.current = true;
    },
    [
      containerRef,
      endMonth,
      layout.cellGap,
      layout.gridOffsetY,
      layout.maxDaysInMonth,
      layout.horizontalExtensionWidth,
      layout.totalHeight,
      notifyPointerUpdate,
      onInteractionModeChange,
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
        endMonth,
        {
          gridOffsetY: layout.gridOffsetY,
          cellGap: layout.cellGap,
          maxDaysInMonth: layout.maxDaysInMonth,
        }
      );

      const isSelectable =
        dateStr && !isDateStringInFuture(dateStr) && !isDateStringBeforeTimelineStart(dateStr);

      notifyPointerUpdate({
        clientX: event.clientX,
        clientY: event.clientY,
        hasActivePointer: false,
      });

      if (!isSelectable || !dateStr) {
        return;
      }

      handleDateClick(dateStr);
      setShowTimelineYears(false);
    },
    [
      endMonth,
      handleDateClick,
      isTouchDevice,
      layout.cellGap,
      layout.gridOffsetY,
      layout.maxDaysInMonth,
      layout.horizontalExtensionWidth,
      notifyPointerUpdate,
      onInteractionModeChange,
      position.width,
      setShowTimelineYears,
      startMonth,
      year,
    ]
  );

  const handleTouchGo = useCallback(
    (date?: string | null) => {
      const dateToSelect = date ?? pendingTouchDate ?? hoveredDate;

      if (
        !dateToSelect ||
        isDateStringInFuture(dateToSelect) ||
        isDateStringBeforeTimelineStart(dateToSelect)
      ) {
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
      notifyPointerUpdate({
        clientX: lastPointerInfoRef.current.clientX,
        clientY: lastPointerInfoRef.current.clientY,
        hasActivePointer: false,
      });
    },
    [
      handleDateClick,
      hoveredDate,
      onInteractionModeChange,
      pendingTouchDate,
      setHoveredDate,
      setShowTimelineYears,
      notifyPointerUpdate,
    ]
  );

  const handleTouchCancel = useCallback(() => {
    activeTouchId.current = null;
    setPendingTouchDate(null);
    setCursorPosition(null);
    touchYOffsetRef.current = 0;
    ignoreMouseEventsRef.current = false;
    onRequestClose();
    onInteractionModeChange("touch");
    notifyPointerUpdate({
      clientX: lastPointerInfoRef.current.clientX,
      clientY: lastPointerInfoRef.current.clientY,
      hasActivePointer: false,
    });
  }, [notifyPointerUpdate, onInteractionModeChange, onRequestClose]);

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
    notifyPointerUpdate({
      clientX: lastPointerInfoRef.current.clientX,
      clientY: lastPointerInfoRef.current.clientY,
      hasActivePointer: false,
    });
  }, [isTouchDevice, notifyPointerUpdate, onMouseLeave, setHoveredDate]);

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
    const scrollElement = scrollContainerRef?.current;
    if (!scrollElement) {
      return undefined;
    }

    const handleScroll = () => {
      const { clientX, clientY, hasActivePointer } = lastPointerInfoRef.current;
      if (!hasActivePointer || clientX === null) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const pointerX = clientX - rect.left;
      const adjustedX = pointerX - layout.horizontalExtensionWidth;

      if (handleExtensionPointer(adjustedX, clientX)) {
        return;
      }

      if (clientY === null) {
        return;
      }

      const pointerY = clientY - rect.top;
      const dateStr = getMegaDateFromCoordinates(
        adjustedX,
        pointerY,
        year,
        position.width,
        startMonth,
        endMonth,
        {
          gridOffsetY: layout.gridOffsetY,
          cellGap: layout.cellGap,
          maxDaysInMonth: layout.maxDaysInMonth,
        }
      );

      if (dateStr && hoveredDate !== dateStr) {
        setHoveredDate(dateStr);
      }
    };

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
    };
  }, [
    handleExtensionPointer,
    layout.cellGap,
    layout.gridOffsetY,
    layout.maxDaysInMonth,
    layout.horizontalExtensionWidth,
    position.width,
    scrollContainerRef,
    setHoveredDate,
    startMonth,
    endMonth,
    year,
    hoveredDate,
    containerRef,
  ]);

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
  onPointerUpdate?: (
    clientX: number | null,
    clientY: number | null,
    hasActivePointer: boolean
  ) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  onRequestClose: () => void;
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
      onPointerUpdate,
      scrollContainerRef,
      onRequestClose,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const calendarContentRef = useRef<HTMLDivElement>(null);

    const { hoveredDate, setHoveredDate } = useStateHover();
    const { setDateTime } = useStateClock();
    const { showTimelineYears, setShowTimelineYears } = useStateToggle();

    const isTouchDevice = isTouchLikeInteraction(interactionMode);

    const layout = useMegaOverlayLayout(position.width, position, parentContainerRef);

    // Handle date click using global state with touch device logic
    const handleDateClick = useCallback(
      (dateStr: string) => {
        const highlightInfo = highlights.get(dateStr);
        const appSeconds = highlightInfo?.notableDatetime
          ? appSecondsFromDateTime(highlightInfo.notableDatetime)
          : null;

        setDateTime(dateStr, appSeconds, { includeTimeInUrl: appSeconds !== null });
      },
      [highlights, setDateTime]
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
      onRequestClose,
      parentContainerRef,
      onPointerUpdate,
      scrollContainerRef,
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
          isTouchDragActive={activeTouchId.current !== null}
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

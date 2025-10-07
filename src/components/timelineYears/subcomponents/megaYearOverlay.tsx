import React, {
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
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

interface HighlightInfo {
  fill: string;
  stroke?: string;
  expedition?: boolean;
  notableDatetime?: string;
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

const useMegaOverlayLayout = (width: number): MegaOverlayLayout => {
  return useMemo(() => {
    const cellGap = MEGA_OVERLAY_CELL_GAP;
    const maxDaysInMonth = MEGA_OVERLAY_MAX_DAYS_IN_MONTH;
    const cellWidth = (width - (12 - 1) * cellGap) / 12;
    const cellSize = cellWidth;
    const totalHeight = maxDaysInMonth * (cellSize + cellGap);
    const touchVerticalOffset = Math.min(Math.max(cellSize * 2, 72), 140);
    const touchExtensionHeight = touchVerticalOffset + cellSize * 1.5;
    const interactiveHeight = totalHeight + touchExtensionHeight;
    const horizontalExtensionWidth = width * 0.25;

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
  }, [width]);
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
  containerRef: React.RefObject<HTMLDivElement>;
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
  externalCursorPosition?: { x: number; y: number } | null;
  initialTouch?: { clientX: number; clientY: number; identifier?: number; sequence: number } | null;
  isTouchDevice?: boolean;
}

// Mega Overlay Component for zoomed year view
const MegaYearOverlay: React.FC<MegaYearOverlayProps> = ({
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
  externalCursorPosition,
  initialTouch,
  isTouchDevice = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const calendarContentRef = useRef<HTMLDivElement>(null);

  const { hoveredDate, setHoveredDate } = useStateHover();
  const { setSelectedDate, setClock } = useStateClock();
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();

  const layout = useMegaOverlayLayout(position.width);

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
  } = useMegaOverlayInteraction({
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
  });

  if (!showTimelineYears) {
    return null;
  }

  if (isTouchDevice) {
    return (
      <div
        ref={containerRef}
        className={styles.touchZone}
        style={{
          left: position.left - layout.horizontalExtensionWidth,
          top: position.top,
          width: position.width + layout.horizontalExtensionWidth * 2,
          height: layout.interactiveHeight,
          zIndex: 10,
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={handleMouseEnter}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={(event) => {
          event.stopPropagation();
          handleTouchCancel();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
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
        <div
          className={styles.touchExtension}
          style={{ height: layout.touchExtensionHeight }}
          aria-hidden="true"
        />
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

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: position.left,
        top: position.top,
        width: position.width,
        height: layout.totalHeight,
        zIndex: 10,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="grid"
      tabIndex={0}
      aria-label={`Calendar for ${year}`}
    >
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
};

export { getMegaDateFromCoordinates } from "./megaYearOverlay.utils";

export default MegaYearOverlay;

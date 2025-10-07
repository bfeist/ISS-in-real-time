import { RefObject, useCallback, useEffect } from "react";
import { MegaOverlayLayout } from "./useMegaOverlayLayout";
import { COLORS } from "../subcomponents/yearCanvas";

export interface HighlightInfo {
  fill: string;
  stroke?: string;
  expedition?: boolean;
  notableDatetime?: string;
}

interface UseMegaOverlayCanvasOptions {
  canvasRef: RefObject<HTMLCanvasElement>;
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

export const useMegaOverlayCanvas = (options: UseMegaOverlayCanvasOptions): void => {
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

export { drawMegaOverlay };

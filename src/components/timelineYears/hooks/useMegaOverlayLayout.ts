import { useMemo } from "react";
import {
  MEGA_OVERLAY_CELL_GAP,
  MEGA_OVERLAY_MAX_DAYS_IN_MONTH,
} from "../subcomponents/megaYearOverlay.utils";

export interface MegaOverlayLayout {
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

export const useMegaOverlayLayout = (width: number): MegaOverlayLayout => {
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

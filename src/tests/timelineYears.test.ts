import { describe, expect, it } from "vitest";
import { getMegaDateFromCoordinates } from "../components/timelineYears/subcomponents/megaYearOverlay.utils";

const buildCoordinate = (params: { monthIndex: number; day: number; width: number }) => {
  const { monthIndex, day, width } = params;
  const cellGap = 1;
  const cellWidth = (width - (12 - 1) * cellGap) / 12;
  const cellSpan = cellWidth + cellGap;
  const gridOffsetY = cellWidth + cellGap;
  const x = monthIndex * cellSpan + cellWidth / 2;
  const y = gridOffsetY + (day - 1) * cellSpan + cellWidth / 2;
  return { x, y, gridOffsetY, cellGap };
};

describe("getMegaDateFromCoordinates", () => {
  const width = 480;

  it("returns correct date for middle of a cell", () => {
    const { x, y, gridOffsetY, cellGap } = buildCoordinate({ monthIndex: 2, day: 15, width });
    const result = getMegaDateFromCoordinates(x, y, 2024, width, 0, 11, {
      gridOffsetY,
      cellGap,
    });
    expect(result).toBe("2024-03-15");
  });

  it("clamps to start month when x falls before visible range", () => {
    const { y, gridOffsetY, cellGap } = buildCoordinate({ monthIndex: 10, day: 20, width });
    const result = getMegaDateFromCoordinates(-25, y, 2000, width, 10, 11, {
      gridOffsetY,
      cellGap,
    });
    expect(result).toBe("2000-11-20");
  });

  it("clamps to end month when x falls after visible range", () => {
    const { y, gridOffsetY, cellGap } = buildCoordinate({ monthIndex: 11, day: 11, width });
    const result = getMegaDateFromCoordinates(width + 30, y, 2025, width, 0, 11, {
      gridOffsetY,
      cellGap,
    });
    expect(result).toBe("2025-12-11");
  });

  it("clamps day to the number of days in the target month", () => {
    const { x, y, gridOffsetY, cellGap } = buildCoordinate({ monthIndex: 1, day: 31, width });
    const result = getMegaDateFromCoordinates(x, y, 2023, width, 0, 11, {
      gridOffsetY,
      cellGap,
    });
    expect(result).toBe("2023-02-28");
  });

  it("returns null when coordinates are out of vertical range", () => {
    const { x, gridOffsetY, cellGap } = buildCoordinate({ monthIndex: 4, day: 10, width });
    const result = getMegaDateFromCoordinates(x, -50, 2022, width, 0, 11, {
      gridOffsetY,
      cellGap,
    });
    expect(result).toBeNull();
  });
});

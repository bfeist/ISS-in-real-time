import paper from "paper";
import { calculateDateFromPosition } from "../utils/indexSliderCalcs";

export const initializePaperCanvas = ({
  canvasElement,
  dataAvailabilityItems,
  selectedCrewStays,
  hoverCallback,
  clickCallback,
}: {
  canvasElement: HTMLCanvasElement;
  dataAvailabilityItems: DataAvailability[];
  selectedCrewStays: CrewArrDepItem[];
  hoverCallback: ({ hoveredDate }: { hoveredDate: string | null }) => void;
  clickCallback: ({ clickedDate }: { clickedDate: string | null }) => void;
}): {
  drawPaperItems: () => void;
  cleanupInputHandlers: () => void;
} => {
  paper.setup(canvasElement);

  // Constants
  const minCanvasWidth = 1500;
  const MAX_SCROLL_SPEED = 20;
  const hoverMargin = 50;
  const YEARS_AREA_HEIGHT = 12;

  const uiGroup = new paper.Group();
  const dataGroup = new paper.Group();

  // Without this the groups children will be transformed by the group matrix
  dataGroup.applyMatrix = false;

  const dataMatrix = new paper.Matrix();
  dataGroup.matrix = dataMatrix;
  paper.project.activeLayer.addChildren([dataGroup, uiGroup]); // Swapped order so uiGroup is on top

  let dayBox: paper.Path.Rectangle | null = null;
  const tool = new paper.Tool();

  let currentOffsetX = 0;
  let currentScrollSpeed = 0;
  let scrollDirection = 0; // -1 for left, 0 for none, 1 for right
  let lastKnownPhysicalMouseX: number | null = null;
  let lastKnownPhysicalMouseY: number | null = null;

  tool.onMouseMove = (event: paper.ToolEvent) => {
    lastKnownPhysicalMouseX = event.point.x;
    lastKnownPhysicalMouseY = event.point.y;
    const viewWidth = canvasElement.clientWidth;

    if (viewWidth < minCanvasWidth) {
      if (event.point.x < hoverMargin) {
        const distanceIntoMargin = hoverMargin - event.point.x;
        currentScrollSpeed = Math.max(1, (distanceIntoMargin / hoverMargin) * MAX_SCROLL_SPEED);
        scrollDirection = 1; // Scroll content left (offsetX increases towards 0)
      } else if (event.point.x > viewWidth - hoverMargin) {
        const distanceIntoMargin = event.point.x - (viewWidth - hoverMargin);
        currentScrollSpeed = Math.max(1, (distanceIntoMargin / hoverMargin) * MAX_SCROLL_SPEED);
        scrollDirection = -1; // Scroll content right (offsetX decreases)
      } else {
        currentScrollSpeed = 0;
        scrollDirection = 0;
      }
    } else {
      currentScrollSpeed = 0;
      scrollDirection = 0;
    }

    // Hide red box if mouse is in years area (top 12 pixels)
    const isInYearsArea = event.point.y < YEARS_AREA_HEIGHT;

    if (!dayBox && !isInYearsArea) {
      dayBox = new paper.Path.Rectangle({
        point: new paper.Point(event.point.x - 3, event.point.y - 3),
        size: new paper.Size(6, 6),
        fillColor: new paper.Color("rgba(255, 0, 0, 0.2)"),
        strokeColor: new paper.Color("red"),
        strokeWidth: 2,
      });
      uiGroup.addChild(dayBox);
    } else if (dayBox && !isInYearsArea) {
      dayBox.segments[0].point.x = event.point.x - 3;
      dayBox.segments[0].point.y = event.point.y - 3;
      dayBox.segments[1].point.x = event.point.x + 3;
      dayBox.segments[1].point.y = event.point.y - 3;
      dayBox.segments[2].point.x = event.point.x + 3;
      dayBox.segments[2].point.y = event.point.y + 3;
      dayBox.segments[3].point.x = event.point.x - 3;
      dayBox.segments[3].point.y = event.point.y + 3;
    } else if (dayBox && isInYearsArea) {
      dayBox.remove();
      dayBox = null;
    }

    // Don't send hover callback if in years area
    if (!isInYearsArea) {
      const effectiveMouseX = event.point.x - currentOffsetX;
      const viewWidth = canvasElement.clientWidth;

      // Calculate the hovered date
      const hoveredDate = calculateDateFromPosition(
        effectiveMouseX,
        event.point.y,
        Math.max(viewWidth, minCanvasWidth),
        paper.view?.bounds.height || null,
        YEARS_AREA_HEIGHT
      );

      hoverCallback({ hoveredDate });
    }
  };

  tool.onMouseUp = (event: paper.ToolEvent) => {
    lastKnownPhysicalMouseX = event.point.x;
    lastKnownPhysicalMouseY = event.point.y;
    const viewWidth = canvasElement.clientWidth;

    // Don't handle clicks in years area
    const isInYearsArea = event.point.y < YEARS_AREA_HEIGHT;

    if (!isInYearsArea) {
      // Calculate effective mouse position considering the offset (which is 0 for wide views anyway)
      const effectiveMouseX = event.point.x - currentOffsetX;

      // Calculate the clicked date
      const clickedDate = calculateDateFromPosition(
        effectiveMouseX,
        event.point.y,
        Math.max(viewWidth, minCanvasWidth),
        paper.view?.bounds.height || null,
        YEARS_AREA_HEIGHT
      );

      clickCallback({ clickedDate });
    }
  };

  const onViewFrame = () => {
    const viewWidth = canvasElement.clientWidth;
    let needsCallbackUpdate = false;
    const oldOffsetX = currentOffsetX;

    if (scrollDirection !== 0 && currentScrollSpeed > 0 && viewWidth < minCanvasWidth) {
      if (scrollDirection === 1) {
        // Scroll content left (offsetX increases towards 0)
        if (currentOffsetX < 0) {
          currentOffsetX = Math.min(0, currentOffsetX + currentScrollSpeed);
        }
        if (currentOffsetX >= 0) {
          // Reached or passed limit
          currentOffsetX = 0; // Clamp
          scrollDirection = 0; // Stop scrolling
        }
      } else if (scrollDirection === -1) {
        // Scroll content right (offsetX decreases)
        const minAllowedOffsetX = -(minCanvasWidth - viewWidth);
        if (currentOffsetX > minAllowedOffsetX) {
          currentOffsetX = Math.max(minAllowedOffsetX, currentOffsetX - currentScrollSpeed);
        }
        if (currentOffsetX <= minAllowedOffsetX) {
          // Reached or passed limit
          currentOffsetX = minAllowedOffsetX; // Clamp
          scrollDirection = 0; // Stop scrolling
        }
      }

      if (oldOffsetX !== currentOffsetX) {
        const deltaX = currentOffsetX - oldOffsetX;
        dataMatrix.translate(deltaX, 0);
        dataGroup.matrix = dataMatrix;
        needsCallbackUpdate = true;
      } else if (scrollDirection !== 0) {
        // If offset didn't change but we were trying to scroll, we're at a boundary.
        scrollDirection = 0;
      }
    } else if (viewWidth >= minCanvasWidth && currentOffsetX !== 0) {
      // Snap back if view is wide, offset is not zero, and not actively scrolling due to hover
      currentOffsetX = 0;
      const deltaX = currentOffsetX - oldOffsetX; // oldOffsetX is non-zero here
      dataMatrix.translate(deltaX, 0);
      dataGroup.matrix = dataMatrix;
      needsCallbackUpdate = true;
      scrollDirection = 0; // Ensure any lingering scroll intent is cleared
      currentScrollSpeed = 0;
    }

    if (
      needsCallbackUpdate &&
      lastKnownPhysicalMouseX !== null &&
      lastKnownPhysicalMouseY !== null
    ) {
      const effectiveMouseX = lastKnownPhysicalMouseX - currentOffsetX;
      const viewWidth = canvasElement.clientWidth;

      // Calculate the hovered date for the updated position
      const hoveredDate = calculateDateFromPosition(
        effectiveMouseX,
        lastKnownPhysicalMouseY,
        Math.max(viewWidth, minCanvasWidth),
        paper.view?.bounds.height || null,
        YEARS_AREA_HEIGHT
      );

      hoverCallback({ hoveredDate });
    }
  };

  paper.view.onFrame = onViewFrame;
  tool.activate();

  const handleDocumentMouseMove = (event: MouseEvent) => {
    const rect = canvasElement.getBoundingClientRect();
    const isInside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    // Also consider years area (top 12 pixels) as out of bounds
    const isInYearsArea = isInside && event.clientY - rect.top < YEARS_AREA_HEIGHT;

    if (!isInside || isInYearsArea) {
      // Stop scrolling when mouse leaves canvas or enters years area
      scrollDirection = 0;
      currentScrollSpeed = 0;

      hoverCallback({ hoveredDate: null });
      // Reset last known positions after the "mouse out" callback
      lastKnownPhysicalMouseX = null;
      lastKnownPhysicalMouseY = null;

      if (dayBox) {
        dayBox.remove();
        dayBox = null;
      }
    }
  };

  document.addEventListener("mousemove", handleDocumentMouseMove);

  const drawPaperItems = () => {
    if (canvasElement && paper.view && paper.project) {
      const clientWidth = canvasElement.clientWidth;
      paper.view.viewSize = new paper.Size(clientWidth, canvasElement.clientHeight);

      const logicalOldOffsetXBeforeDraw = currentOffsetX;
      dataMatrix.translate(-logicalOldOffsetXBeforeDraw, 0);
      dataGroup.matrix = dataMatrix;

      uiGroup.removeChildren();
      dataGroup.removeChildren();
      // verticalLine = null;
      dayBox = null;

      const logicalCanvasWidth = Math.max(clientWidth, minCanvasWidth);
      drawCalendar(
        dataGroup,
        dataAvailabilityItems,
        logicalCanvasWidth,
        YEARS_AREA_HEIGHT,
        selectedCrewStays
      );

      let newTargetOffsetX;
      if (clientWidth < minCanvasWidth) {
        newTargetOffsetX = Math.max(
          -(logicalCanvasWidth - clientWidth),
          Math.min(0, logicalOldOffsetXBeforeDraw)
        );
      } else {
        newTargetOffsetX = 0;
      }

      dataMatrix.translate(newTargetOffsetX, 0);
      dataGroup.matrix = dataMatrix;
      currentOffsetX = newTargetOffsetX;
    }
  };

  drawPaperItems();

  const cleanupInputHandlers = () => {
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    if (tool) {
      tool.remove();
    }
    if (paper.view) {
      paper.view.onFrame = undefined; // Clean up onFrame handler
    }
  };

  return { drawPaperItems, cleanupInputHandlers };
};

function drawCalendar(
  group: paper.Group,
  dataAvailabilityItems: DataAvailability[],
  canvasLogicalWidth: number,
  yearsAreaHeight: number,
  selectedCrewStays: CrewArrDepItem[]
): void {
  // epoch is Nov 2, 2000.
  const epochYear = 2000;
  const epochMonth = 10; // November (0-indexed)

  // Draw ticks for each day across the whole width of the canvas
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const totalMonthsSinceEpoch = (currentYear - epochYear) * 12 + (currentMonth - epochMonth) + 1;

  let totalDaysSinceEpoch = 0;
  const allMonths = [];

  // First calculate total days and store month info
  for (let i = 0; i < totalMonthsSinceEpoch; i++) {
    const monthDate = new Date(epochYear, epochMonth + i, 1);
    // Get last day of this month
    const nextMonth = new Date(monthDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(0); // Last day of current month
    const daysInMonth = nextMonth.getDate();

    allMonths.push({
      date: monthDate,
      daysInMonth,
      startDay: totalDaysSinceEpoch,
    });

    totalDaysSinceEpoch += daysInMonth;
  }

  // Calculate day height based on maximum possible days in a month (31)
  const maxDaysInMonth = 31;
  const dayMarkerTopOffset = yearsAreaHeight;
  const dayHeight = (paper.view.bounds.height - dayMarkerTopOffset) / maxDaysInMonth;

  // Draw months and days
  for (const month of allMonths) {
    const monthStartX = (month.startDay / totalDaysSinceEpoch) * canvasLogicalWidth;

    // Draw month markers (like January lines with year)
    drawMonthMarker({
      group,
      month,
      monthStartX,
      dayMarkerTopOffset,
    });

    // Draw days for this month
    drawDaysForMonth({
      group,
      month,
      monthStartX,
      dayHeight,
      dayMarkerTopOffset,
      maxDaysInMonth,
      dataAvailabilityItems,
      selectedCrewStays,
    });
  }
}

function drawMonthMarker({
  group,
  month,
  monthStartX,
  dayMarkerTopOffset,
}: {
  group: paper.Group;
  month: { date: Date; daysInMonth: number; startDay: number };
  monthStartX: number;
  dayMarkerTopOffset: number;
}): void {
  // Add background line for January with gradient
  if (month.date.getMonth() === 0) {
    // Create gradient for January line
    const gradientWidth = 30;
    const januaryLine = new paper.Path.Rectangle({
      point: new paper.Point(monthStartX, paper.view.bounds.top + dayMarkerTopOffset),
      size: new paper.Size(gradientWidth, paper.view.bounds.height - dayMarkerTopOffset),
    });

    // Create gradient fill
    const gradient = new paper.Gradient();
    gradient.stops = [
      new paper.GradientStop(new paper.Color(0, 0, 0, 0), 0),
      new paper.GradientStop(new paper.Color(0, 0, 0, 0), 1),
    ];

    const from = new paper.Point(monthStartX, 0);
    const to = new paper.Point(monthStartX + gradientWidth, 0);
    const gradientColor = new paper.Color(gradient, from, to);

    januaryLine.fillColor = gradientColor;
    januaryLine.strokeWidth = 0;
    group.addChild(januaryLine);

    // Add year text for January - position at the very top
    const yearText = new paper.PointText({
      point: new paper.Point(monthStartX + 2, paper.view.bounds.top + 10),
      content: month.date.getFullYear().toString(),
      fillColor: new paper.Color(0, 0, 0),
      fontSize: 10,
      fontWeight: "bold",
    });
    group.addChild(yearText);
  }
}

function drawDaysForMonth({
  group,
  month,
  monthStartX,
  dayHeight,
  dayMarkerTopOffset,
  maxDaysInMonth,
  dataAvailabilityItems,
  selectedCrewStays,
}: {
  group: paper.Group;
  month: { date: Date; daysInMonth: number };
  monthStartX: number;
  dayHeight: number;
  dayMarkerTopOffset: number;
  maxDaysInMonth: number;
  dataAvailabilityItems: DataAvailability[];
  selectedCrewStays: CrewArrDepItem[];
}): void {
  // Define colors based on data availability
  const colors = {
    noData: new paper.Color("#999999"), // Light grey for no data
    otherData: new paper.Color("#535353"), // Dark grey for other data
    comm: new paper.Color("black"), // Black for comm
    youtube: new paper.Color("blue"), // Blue for YouTube
  };

  // Helper function to check if a date is within crew member's time on board
  const isDateInCrewPeriod = (checkDate: Date): boolean => {
    if (!selectedCrewStays || selectedCrewStays.length === 0) return false;

    return selectedCrewStays.some((stay) => {
      const arrivalDate = new Date(stay.arrivalDate);
      const departureDate = new Date(stay.departureDate);
      // Set time to start of day for accurate comparison
      arrivalDate.setHours(0, 0, 0, 0);
      departureDate.setHours(23, 59, 59, 999);
      checkDate.setHours(12, 0, 0, 0); // Set to noon for consistent comparison

      return checkDate >= arrivalDate && checkDate <= departureDate;
    });
  };

  // Draw day boxes within this month
  for (let day = 1; day <= maxDaysInMonth; day++) {
    // Y position - day 1 at top + offset
    const dayY = paper.view.bounds.top + dayMarkerTopOffset + (day - 1) * dayHeight;

    // Only add day marker if this month actually has this day
    if (day <= month.daysInMonth) {
      // Create date object for this specific day
      const currentDate = new Date(month.date);
      currentDate.setDate(day);
      const dateString = currentDate.toISOString().split("T")[0];

      // Find if we have data for this date
      const dayItem = dataAvailabilityItems.find((item) => item.date === dateString);

      // Determine color based on data availability
      let dayColor = null;
      let boxSideSize = 3;

      if (dayItem) {
        if (dayItem.youtube) {
          dayColor = colors.youtube;
        } else if (dayItem.comm || dayItem.vvComm) {
          dayColor = colors.comm;
        } else if (dayItem.blog || dayItem.activitySummary || dayItem.earthPhotography) {
          dayColor = colors.otherData;
        } else {
          dayColor = colors.noData;
        }
      } else {
        dayColor = colors.noData;
      }

      // Make EVA days bolder
      if (dayItem && dayItem.eva) {
        boxSideSize = 4; // Make EVA days slightly larger
      }

      // Add background if this date is within selected crew member's time on board
      // Draw this BEFORE the day box so it appears behind
      if (isDateInCrewPeriod(new Date(currentDate))) {
        const backgroundPadding = 2;
        const backgroundBox = new paper.Path.Rectangle({
          point: new paper.Point(
            monthStartX + 2 - backgroundPadding,
            dayY + (dayHeight - boxSideSize) / 2 - backgroundPadding
          ),
          size: new paper.Size(
            boxSideSize + 2 * backgroundPadding,
            boxSideSize + 2 * backgroundPadding
          ),
          fillColor: new paper.Color("yellow"),
          strokeColor: null,
          strokeWidth: 0,
        });
        group.addChild(backgroundBox);
      }

      // Create a small box for each day
      const dayBox = new paper.Path.Rectangle({
        point: new paper.Point(monthStartX + 2, dayY + (dayHeight - boxSideSize) / 2),
        size: new paper.Size(boxSideSize, boxSideSize),
        fillColor: dayColor,
        strokeColor: null,
        strokeWidth: 0,
      });

      group.addChild(dayBox);
    }
  }
}

export const clearPaperCanvas = (): void => {
  if (paper.project) {
    // Clears all items from the currently active paper.Project.
    // This removes all layers and their children.
    paper.project.clear();
  }
};

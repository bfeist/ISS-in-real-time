import paper from "paper";
import { calculateDateFromPosition } from "../../utils/indexSliderCalcs";

export const initializePaperCanvas = ({
  canvasElement,
  dataAvailabilityItems,
  selectedCrewStays,
  hoverCallback,
  clickCallback,
  canvasWidth = 1500,
}: {
  canvasElement: HTMLCanvasElement;
  dataAvailabilityItems: DataAvailability[];
  selectedCrewStays: CrewArrDepItem[];
  hoverCallback: ({ hoveredDate }: { hoveredDate: string | null }) => void;
  clickCallback: ({ clickedDate }: { clickedDate: string | null }) => void;
  canvasWidth?: number;
}): {
  drawPaperItems: () => void;
  cleanupInputHandlers: () => void;
} => {
  // Handle high-DPI displays (like iPhone Retina screens)
  const pixelRatio = window.devicePixelRatio || 1;
  canvasElement.width = canvasElement.clientWidth * pixelRatio;
  canvasElement.height = canvasElement.clientHeight * pixelRatio;

  paper.setup(canvasElement);

  // Scale the view to account for pixel ratio
  if (pixelRatio !== 1) {
    paper.view.matrix = new paper.Matrix().scale(pixelRatio);
  }

  // Constants - simplified without scroll handling
  const YEARS_AREA_HEIGHT = 0; // Years will be handled externally

  const uiGroup = new paper.Group();
  const dataGroup = new paper.Group();

  paper.project.activeLayer.addChildren([dataGroup, uiGroup]);

  let dayBox: paper.Path.Rectangle | null = null;
  const tool = new paper.Tool();

  tool.onMouseMove = (event: paper.ToolEvent) => {
    // Get event point in device-independent coordinates
    const point = event.point;

    // Create or update the red hover indicator box
    if (!dayBox) {
      dayBox = new paper.Path.Rectangle({
        point: new paper.Point(point.x - 3, point.y - 3),
        size: new paper.Size(6, 6),
        fillColor: new paper.Color("rgba(255, 0, 0, 0.2)"),
        strokeColor: new paper.Color("red"),
        strokeWidth: 2,
      });
      uiGroup.addChild(dayBox);
    } else {
      dayBox.segments[0].point.x = point.x - 3;
      dayBox.segments[0].point.y = point.y - 3;
      dayBox.segments[1].point.x = point.x + 3;
      dayBox.segments[1].point.y = point.y - 3;
      dayBox.segments[2].point.x = point.x + 3;
      dayBox.segments[2].point.y = point.y + 3;
      dayBox.segments[3].point.x = point.x - 3;
      dayBox.segments[3].point.y = point.y + 3;
    }

    // Calculate the hovered date
    const hoveredDate = calculateDateFromPosition(
      point.x,
      point.y,
      canvasWidth,
      paper.view?.bounds.height || null,
      YEARS_AREA_HEIGHT
    );

    hoverCallback({ hoveredDate });
  };

  tool.onMouseUp = (event: paper.ToolEvent) => {
    // Get event point in device-independent coordinates
    const point = event.point;

    // Calculate the clicked date
    const clickedDate = calculateDateFromPosition(
      point.x,
      point.y,
      canvasWidth,
      paper.view?.bounds.height || null,
      YEARS_AREA_HEIGHT
    );

    clickCallback({ clickedDate });
  };

  // Handle mouse leaving the canvas
  const handleDocumentMouseMove = (event: MouseEvent) => {
    const rect = canvasElement.getBoundingClientRect();
    const isInside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (!isInside) {
      hoverCallback({ hoveredDate: null });
      if (dayBox) {
        dayBox.remove();
        dayBox = null;
      }
    }
  };

  document.addEventListener("mousemove", handleDocumentMouseMove);

  tool.activate();

  const drawPaperItems = () => {
    if (canvasElement && paper.view && paper.project) {
      // Get the current pixel ratio
      const pixelRatio = window.devicePixelRatio || 1;

      // Reset the view matrix first
      paper.view.matrix = new paper.Matrix();

      // Set the canvas dimensions with pixel ratio factored in
      canvasElement.width = canvasWidth * pixelRatio;
      canvasElement.height = canvasElement.clientHeight * pixelRatio;

      // Update the view size (in CSS pixels)
      paper.view.viewSize = new paper.Size(canvasWidth, canvasElement.clientHeight);

      // Apply the pixel ratio scaling as a view matrix transformation
      paper.view.matrix = new paper.Matrix().scale(pixelRatio);

      uiGroup.removeChildren();
      dataGroup.removeChildren();
      dayBox = null;

      drawCalendar(
        dataGroup,
        dataAvailabilityItems,
        canvasWidth,
        YEARS_AREA_HEIGHT,
        selectedCrewStays
      );
    }
  };

  drawPaperItems();

  const cleanupInputHandlers = () => {
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    if (tool) {
      tool.remove();
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

    // Draw days for this month (year text will be handled externally)
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

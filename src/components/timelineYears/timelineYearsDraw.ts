import paper from "paper";
import { calculateDateFromPosition } from "../../utils/indexSliderCalcs";

export const initializePaperCanvas = ({
  canvasElement,
  selectedDate,
  dataAvailabilityItems,
  selectedCrewStays,
  contentHighlights,
  hoverCallback,
  clickCallback,
  canvasWidth = 1500,
}: {
  canvasElement: HTMLCanvasElement;
  selectedDate: string | null;
  dataAvailabilityItems: DataAvailability[];
  selectedCrewStays: CrewArrDepItem[];
  contentHighlights: string[];
  hoverCallback: ({ hoveredDate }: { hoveredDate: string | null }) => void;
  clickCallback: ({ clickedDate }: { clickedDate: string | null }) => void;
  canvasWidth?: number;
}): {
  drawPaperItems: () => void;
  cleanupInputHandlers: () => void;
} => {
  // Create an isolated Paper.js project for timelineYears to avoid conflicts with timelineDay
  const project = new paper.Project(canvasElement);

  // Activate this project to ensure all operations work within its scope
  project.activate();

  // Constants - simplified without scroll handling
  const YEARS_AREA_HEIGHT = 0; // Years will be handled externally

  const uiGroup = new paper.Group();
  const dataGroup = new paper.Group();

  project.activeLayer.addChildren([dataGroup, uiGroup]);

  let lastHoveredDate: string | null = null; // Track the last hovered date
  let hoveredDayBox: paper.Path.Rectangle | null = null; // Track the currently hovered day box
  let originalStrokeColor: paper.Color | null = null; // Store original stroke color
  let originalStrokeWidth: number = 0; // Store original stroke width
  const dayBoxMap: Map<string, paper.Path.Rectangle> = new Map(); // Map dates to day boxes
  const tool = new paper.Tool();

  tool.onMouseMove = (event: paper.ToolEvent) => {
    // Calculate the hovered date
    const hoveredDate = calculateDateFromPosition(
      event.point.x,
      event.point.y,
      canvasWidth,
      project.view?.bounds.height || null,
      YEARS_AREA_HEIGHT
    );

    // Only process if the hovered date has actually changed
    if (hoveredDate !== lastHoveredDate) {
      // Reset previous hovered day box stroke
      if (hoveredDayBox) {
        hoveredDayBox.strokeColor = originalStrokeColor;
        hoveredDayBox.strokeWidth = originalStrokeWidth;
        hoveredDayBox = null;
      }

      // Find and highlight the new day box if hovering over a valid date
      if (hoveredDate) {
        // Find the day box corresponding to this date using our map
        const foundDayBox = dayBoxMap.get(hoveredDate);
        if (foundDayBox) {
          // Store original properties
          originalStrokeColor = foundDayBox.strokeColor;
          originalStrokeWidth = foundDayBox.strokeWidth;

          // Apply hover highlight - subtle red stroke
          foundDayBox.strokeColor = new paper.Color("red");
          foundDayBox.strokeWidth = 1.5; // Thin but visible stroke
          hoveredDayBox = foundDayBox;
        }
      }

      lastHoveredDate = hoveredDate;
      hoverCallback({ hoveredDate });
    }
  };

  tool.onMouseUp = (event: paper.ToolEvent) => {
    // Calculate the clicked date
    const clickedDate = calculateDateFromPosition(
      event.point.x,
      event.point.y,
      canvasWidth,
      project.view?.bounds.height || null,
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
      // Only call callback if we're not already at null
      if (lastHoveredDate !== null) {
        lastHoveredDate = null;
        hoverCallback({ hoveredDate: null });
      }
      // Reset hovered day box stroke
      if (hoveredDayBox) {
        hoveredDayBox.strokeColor = originalStrokeColor;
        hoveredDayBox.strokeWidth = originalStrokeWidth;
        hoveredDayBox = null;
      }
    }
  };

  document.addEventListener("mousemove", handleDocumentMouseMove);

  tool.activate();

  const drawPaperItems = () => {
    if (canvasElement && project.view && project) {
      try {
        // Activate this project before making changes
        project.activate();
        const displayWidth = canvasWidth;
        const displayHeight = canvasElement.clientHeight;

        // Set canvas dimensions to match display size
        canvasElement.width = displayWidth;
        canvasElement.height = displayHeight;
        canvasElement.style.width = `${displayWidth}px`;
        canvasElement.style.height = `${displayHeight}px`;

        // Set Paper.js view size to match canvas dimensions
        project.view.viewSize = new paper.Size(displayWidth, displayHeight);

        uiGroup.removeChildren();
        dataGroup.removeChildren();
        hoveredDayBox = null;
        originalStrokeColor = null;
        originalStrokeWidth = 0;
        dayBoxMap.clear(); // Clear the day box map

        drawCalendar(
          dataGroup,
          dataAvailabilityItems,
          canvasWidth,
          YEARS_AREA_HEIGHT,
          selectedCrewStays,
          contentHighlights,
          dayBoxMap
        );

        // Then highlight the selected date's day box if a date is selected
        if (selectedDate) {
          try {
            const selectedDayBox = dayBoxMap.get(selectedDate);
            if (selectedDayBox) {
              // Apply red stroke to the selected date's day box
              selectedDayBox.strokeColor = new paper.Color("red");
              selectedDayBox.strokeWidth = 1.5; // Same as hover effect
            }
          } catch (error) {
            console.error("Error highlighting selected date:", error);
            // Continue without the selected date highlight
          }
        }
      } catch (error) {
        console.error("Error in drawPaperItems:", error);
      }
    }
  };

  drawPaperItems();

  const cleanupInputHandlers = () => {
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    // Reset any hovered day box before cleanup
    if (hoveredDayBox) {
      hoveredDayBox.strokeColor = originalStrokeColor;
      hoveredDayBox.strokeWidth = originalStrokeWidth;
      hoveredDayBox = null;
    }
    if (tool) {
      tool.remove();
    }
    // Remove the project when cleaning up to prevent memory leaks
    if (project) {
      project.remove();
    }
  };

  return { drawPaperItems, cleanupInputHandlers };
};

function drawCalendar(
  group: paper.Group,
  dataAvailabilityItems: DataAvailability[],
  canvasLogicalWidth: number,
  yearsAreaHeight: number,
  selectedCrewStays: CrewArrDepItem[],
  contentHighlights: string[],
  dayBoxMap: Map<string, paper.Path.Rectangle>
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
      contentHighlights,
      dayBoxMap,
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
  contentHighlights,
  dayBoxMap,
}: {
  group: paper.Group;
  month: { date: Date; daysInMonth: number };
  monthStartX: number;
  dayHeight: number;
  dayMarkerTopOffset: number;
  maxDaysInMonth: number;
  dataAvailabilityItems: DataAvailability[];
  selectedCrewStays: CrewArrDepItem[];
  contentHighlights: string[];
  dayBoxMap: Map<string, paper.Path.Rectangle>;
}): void {
  // Define colors based on data availability
  const colors = {
    noData: new paper.Color("rgba(0, 0, 0, 0.2)"),
    someData: new paper.Color("rgba(0, 0, 0, 0.4)"),
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

  // Helper function to check if a day's data availability satisfies all content highlights
  const doesDaySatisfyContentHighlights = (dayItem: DataAvailability | undefined): boolean => {
    if (!contentHighlights || contentHighlights.length === 0) return false;
    if (!dayItem) return false;

    // Check if all content highlights are satisfied by this day's data
    return contentHighlights.every((highlight) => {
      switch (highlight.toLowerCase()) {
        case "comm":
          return dayItem.comm;
        case "vvcomm":
          return dayItem.vvComm;
        case "youtube":
          return dayItem.youtube;
        case "eva":
          return dayItem.eva;
        case "blog":
          return dayItem.blog;
        case "activitysummary":
          return dayItem.activitySummary;
        case "earthphotography":
          return dayItem.earthPhotography;
        default:
          return false;
      }
    });
  };

  // Draw day boxes within this month
  for (let day = 1; day <= maxDaysInMonth; day++) {
    // Y position - day 1 at top + offset
    const dayY = paper.view.bounds.top + dayMarkerTopOffset + (day - 1) * dayHeight;

    // Only add day marker if this month actually has this day
    if (day <= month.daysInMonth) {
      // Use a simple horizontal offset that's consistent across all months
      const dayX = monthStartX + 2;
      // Create date object for this specific day
      const currentDate = new Date(month.date);
      currentDate.setDate(day);
      const dateString = currentDate.toISOString().split("T")[0];

      // Find if we have data for this date
      const dayItem = dataAvailabilityItems.find((item) => item.date === dateString);

      // Determine color based on data availability
      const dayColor = dayItem ? colors.someData : colors.noData;
      const boxSideSize = 4;

      // Check if this date is within selected crew member's time on board
      const isCrewOnboard = isDateInCrewPeriod(new Date(currentDate));

      // Add circular background for crew onboard periods
      if (isCrewOnboard) {
        const backgroundRadius = boxSideSize * 0.8; // Slightly larger than the day box
        const centerX = dayX + boxSideSize / 2;
        const centerY = dayY + (dayHeight - boxSideSize) / 2 + boxSideSize / 2;

        const backgroundCircle = new paper.Path.Circle({
          center: new paper.Point(centerX, centerY),
          radius: backgroundRadius,
          fillColor: new paper.Color("rgba(255, 215, 0, 0.4)"), // Gold with transparency
          strokeColor: null,
          strokeWidth: 0,
        });
        group.addChild(backgroundCircle);
      }

      // Determine stroke properties based on content highlights
      const satisfiesHighlights = doesDaySatisfyContentHighlights(dayItem);
      const strokeColor = satisfiesHighlights
        ? new paper.Color("green")
        : new paper.Color("rgba(0, 0, 0, 0.1)"); // Very light stroke instead of transparent
      const strokeWidth = 1; // Always have stroke width of 1 so hover can work

      // Create a small box for each day
      const dayBox = new paper.Path.Rectangle({
        point: new paper.Point(dayX, dayY + (dayHeight - boxSideSize) / 2),
        size: new paper.Size(boxSideSize, boxSideSize),
        fillColor: dayColor,
        strokeColor: strokeColor,
        strokeWidth: strokeWidth,
      });

      // Set the date data after creation (Paper.js sometimes doesn't set data in constructor properly)
      dayBox.data = { dayDate: dateString };

      // Store in our map for quick lookup during hover
      dayBoxMap.set(dateString, dayBox);

      group.addChild(dayBox);
    }
  }
}

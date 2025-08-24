import paper from "paper";
import { calculateDateFromPosition, YEAR_GAP_PX } from "../../utils/indexSliderCalcs";

// Constants

export const initializePaperCanvas = ({
  canvasElement,
  selectedDate,
  dataAvailabilityItems,
  selectedCrewStays,
  contentHighlights,
  hoverCallback,
  clickCallback,
  canvasWidth = 1500, // Default fallback, but should be calculated dynamically
  paperScope,
}: {
  canvasElement: HTMLCanvasElement;
  selectedDate: string | null;
  dataAvailabilityItems: DataAvailability[];
  selectedCrewStays: CrewArrDepItem[];
  contentHighlights: string[];
  hoverCallback: ({ hoveredDate }: { hoveredDate: string | null }) => void;
  clickCallback: ({ clickedDate }: { clickedDate: string | null }) => void;
  canvasWidth?: number;
  paperScope: paper.PaperScope;
}): {
  drawPaperItems: () => void;
  cleanupInputHandlers: () => void;
} => {
  // Use the passed scope instead of creating a new project
  const project = paperScope.project;

  // Activate the project to ensure it's the current context
  project.activate();

  // Constants - simplified without scroll handling
  const YEARS_AREA_HEIGHT = 0; // Years will be handled externally

  const uiGroup = new paperScope.Group();
  const dataGroup = new paperScope.Group();

  project.activeLayer.addChildren([dataGroup, uiGroup]);

  let lastHoveredDate: string | null = null; // Track the last hovered date
  let hoveredDayBox: paper.Path.Rectangle | null = null; // Track the currently hovered day box
  let originalStrokeColor: paper.Color | null = null; // Store original stroke color
  let originalStrokeWidth: number = 0; // Store original stroke width
  const dayBoxMap: Map<string, paper.Path.Rectangle> = new Map(); // Map dates to day boxes
  const tool = new paperScope.Tool();

  tool.onMouseMove = (event: paper.ToolEvent) => {
    // Calculate the hovered date using actual canvas dimensions
    const actualCanvasWidth = canvasElement.clientWidth || canvasWidth;
    const hoveredDate = calculateDateFromPosition(
      event.point.x,
      event.point.y,
      actualCanvasWidth,
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
    // Calculate the clicked date using actual canvas dimensions
    const actualCanvasWidth = canvasElement.clientWidth || canvasWidth;
    const clickedDate = calculateDateFromPosition(
      event.point.x,
      event.point.y,
      actualCanvasWidth,
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

  // Do NOT activate the tool globally - each project should manage its own tools independently

  const drawPaperItems = () => {
    if (canvasElement && project && project.view) {
      try {
        // Activate the project to ensure it's the current context
        project.activate();
        const displayWidth = canvasWidth;
        const displayHeight = canvasElement.clientHeight;

        // Set canvas dimensions to match display size
        canvasElement.width = displayWidth;
        canvasElement.height = displayHeight;
        canvasElement.style.width = `${displayWidth}px`;
        canvasElement.style.height = `${displayHeight}px`;

        // Set paperScope.js view size to match canvas dimensions
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
          displayWidth, // Use actual display width instead of canvasWidth parameter
          YEARS_AREA_HEIGHT,
          selectedCrewStays,
          contentHighlights,
          dayBoxMap,
          project.view
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

        // Force view update to ensure rendering
        project.view.update();
      } catch (error) {
        console.error("Error in drawPaperItems:", error);
      }
    }
  };

  const cleanupInputHandlers = () => {
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    // Reset any hovered day box before cleanup
    if (hoveredDayBox) {
      hoveredDayBox.strokeColor = originalStrokeColor;
      hoveredDayBox.strokeWidth = originalStrokeWidth;
      hoveredDayBox = null;
    }

    // Clear group children before removing project
    if (uiGroup) {
      uiGroup.removeChildren();
    }
    if (dataGroup) {
      dataGroup.removeChildren();
    }

    // Clear the day box map
    dayBoxMap.clear();

    if (tool) {
      tool.remove();
    }
    // Don't remove the project here - it will be removed by the scope cleanup
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
  dayBoxMap: Map<string, paper.Path.Rectangle>,
  projectView: paper.View
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
  let totalYearGaps = 0; // Track the number of year gaps
  const allMonths = [];

  // First calculate total days and store month info, accounting for year gaps
  for (let i = 0; i < totalMonthsSinceEpoch; i++) {
    const monthDate = new Date(epochYear, epochMonth + i, 1);
    // Get last day of this month
    const nextMonth = new Date(monthDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(0); // Last day of current month
    const daysInMonth = nextMonth.getDate();

    // If this is January (month 0), add a year gap (except for the very first month)
    const isJanuary = monthDate.getMonth() === 0;
    const isFirstMonth = i === 0;

    // Add gap before this month if it's January (but not the first month)
    if (isJanuary && !isFirstMonth) {
      totalYearGaps++;
    }

    allMonths.push({
      date: monthDate,
      daysInMonth,
      startDay: totalDaysSinceEpoch,
      yearGapsBefore: totalYearGaps,
      hasYearGapBefore: isJanuary && !isFirstMonth,
    });

    totalDaysSinceEpoch += daysInMonth;
  }

  // Calculate the available width for timeline content (reduced by total gap space)
  const availableWidth = canvasLogicalWidth - totalYearGaps * YEAR_GAP_PX;

  // Calculate day height based on maximum possible days in a month (31)
  const maxDaysInMonth = 31;
  const dayMarkerTopOffset = yearsAreaHeight;
  const dayHeight = (projectView.bounds.height - dayMarkerTopOffset) / maxDaysInMonth;

  // Draw months and days
  for (const month of allMonths) {
    // Calculate month start position including accumulated gaps
    const basePosition = (month.startDay / totalDaysSinceEpoch) * availableWidth;
    const gapOffset = month.yearGapsBefore * YEAR_GAP_PX;
    const monthStartX = basePosition + gapOffset;

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
      projectView,
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
  projectView,
}: {
  group: paper.Group;
  month: {
    date: Date;
    daysInMonth: number;
    startDay: number;
    yearGapsBefore: number;
    hasYearGapBefore: boolean;
  };
  monthStartX: number;
  dayHeight: number;
  dayMarkerTopOffset: number;
  maxDaysInMonth: number;
  dataAvailabilityItems: DataAvailability[];
  selectedCrewStays: CrewArrDepItem[];
  contentHighlights: string[];
  dayBoxMap: Map<string, paper.Path.Rectangle>;
  projectView: paper.View;
}): void {
  // Define colors based on data availability
  const colors = {
    noData: new paper.Color("#5b5d77ff"),
    someData: new paper.Color("#6d7090"),
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
    const dayY = projectView.bounds.top + dayMarkerTopOffset + (day - 1) * dayHeight;

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

      // Determine color properties based on content highlights and crew onboard status
      const satisfiesHighlights = doesDaySatisfyContentHighlights(dayItem);
      const strokeColor = satisfiesHighlights
        ? new paper.Color("#C500AB")
        : new paper.Color("rgba(0, 0, 0, 0)"); // Very light stroke instead of transparent
      const strokeWidth = 1; // Always have stroke width of 1 so hover can work

      // Priority: crew onboard > content highlights > default data availability
      let fillColor: paper.Color;
      if (isCrewOnboard) {
        fillColor = new paper.Color("#E2DB00");
      } else if (satisfiesHighlights) {
        fillColor = new paper.Color("#D9D9D9");
      } else {
        fillColor = dayColor;
      }

      // Create a small box for each day
      const dayBox = new paper.Path.Rectangle({
        point: new paper.Point(dayX, dayY + (dayHeight - boxSideSize) / 2),
        size: new paper.Size(boxSideSize, boxSideSize),
        fillColor,
        strokeColor: strokeColor,
        strokeWidth: strokeWidth,
      });

      // Set the date data after creation (paperScope.js sometimes doesn't set data in constructor properly)
      dayBox.data = { dayDate: dateString };

      // Store in our map for quick lookup during hover
      dayBoxMap.set(dateString, dayBox);

      group.addChild(dayBox);
    }
  }
}

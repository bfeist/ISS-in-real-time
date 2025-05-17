import paper from "paper";

export const initializePaperCanvas = ({
  canvasElement,
  onMouseMoveCallback,
  dataAvailabilityItems,
}: {
  canvasElement: HTMLCanvasElement;
  onMouseMoveCallback: (content: CanvasCallbackContent) => void;
  dataAvailabilityItems: DataAvailability[];
}): {
  drawPaperItems: () => void;
  cleanupInputHandlers: () => void;
} => {
  paper.setup(canvasElement);

  // Create groups and add them to the project
  const uiGroup = new paper.Group();
  const dataGroup = new paper.Group();
  paper.project.activeLayer.addChildren([uiGroup, dataGroup]);

  let verticalLine: paper.Path.Line | null = null;
  const tool = new paper.Tool();
  tool.onMouseMove = (event: paper.ToolEvent) => {
    if (!verticalLine) {
      verticalLine = new paper.Path.Line(
        new paper.Point(event.point.x, paper.view.bounds.top),
        new paper.Point(event.point.x, paper.view.bounds.bottom)
      );
      verticalLine.strokeColor = new paper.Color("red");
      verticalLine.strokeWidth = 1;
      uiGroup.addChild(verticalLine);
    } else {
      // Update the position of the vertical line (this is faster than removing and re-adding)
      verticalLine.position.x = event.point.x;
    }

    onMouseMoveCallback({
      mouseX: event.point.x,
      mouseY: event.point.y,
      canvasWidth: paper.view.bounds.width,
    });
  };

  tool.activate();

  const handleDocumentMouseMove = (event: MouseEvent) => {
    const rect = canvasElement.getBoundingClientRect();
    const isInside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (!isInside) {
      // Mouse has left the canvas area
      if (verticalLine) {
        verticalLine.remove();
        verticalLine = null;
      }
      onMouseMoveCallback({ mouseX: null, mouseY: null, canvasWidth: paper.view.bounds.width }); // Signal mouse has left, pass current canvas width
    }
  };

  document.addEventListener("mousemove", handleDocumentMouseMove);

  const drawPaperItems = () => {
    if (canvasElement && paper.view && paper.project) {
      // Update view size
      paper.view.viewSize = new paper.Size(canvasElement.clientWidth, canvasElement.clientHeight);

      // Clear the groups instead of the entire project
      uiGroup.removeChildren();
      dataGroup.removeChildren();
      verticalLine = null;

      drawCalendar(dataGroup, dataAvailabilityItems);
    }
  };

  drawPaperItems(); // Call initially to set size and position elements correctly.

  const cleanupInputHandlers = () => {
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    if (tool) {
      tool.remove();
    }
  };

  return { drawPaperItems, cleanupInputHandlers };
};

function drawCalendar(group: paper.Group, dataAvailabilityItems: DataAvailability[]): void {
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
  const dayHeight = paper.view.bounds.height / maxDaysInMonth;
  const dayMarkerTopOffset = 12;

  // Draw months and days
  for (const month of allMonths) {
    const monthStartX = (month.startDay / totalDaysSinceEpoch) * paper.view.bounds.width;

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
    const gradientWidth = 30; // Width of the gradient area
    const januaryLine = new paper.Path.Rectangle({
      point: new paper.Point(monthStartX, paper.view.bounds.top + dayMarkerTopOffset),
      size: new paper.Size(gradientWidth, paper.view.bounds.height),
    });

    // Create gradient fill - fixed syntax
    const gradient = new paper.Gradient();
    gradient.stops = [
      new paper.GradientStop(new paper.Color(0, 0, 0, 0.2), 0),
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
}: {
  group: paper.Group;
  month: { date: Date; daysInMonth: number };
  monthStartX: number;
  dayHeight: number;
  dayMarkerTopOffset: number;
  maxDaysInMonth: number;
  dataAvailabilityItems: DataAvailability[];
}): void {
  // Define colors based on data availability
  const colors = {
    noData: new paper.Color("#999999"), // Light grey for no data
    otherData: new paper.Color("#535353"), // Dark grey for other data
    comm: new paper.Color("black"), // Black for comm
    youtube: new paper.Color("blue"), // Blue for YouTube
  };

  // Draw day boxes within this month
  for (let day = 1; day <= maxDaysInMonth; day++) {
    // Y position - day 1 at top + offset
    const dayY = paper.view.bounds.top + dayMarkerTopOffset + (day - 1) * dayHeight;

    // Only add day marker if this month actually has this day
    if (day <= month.daysInMonth) {
      // Create date string in ISO format (YYYY-MM-DD)
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

        // Make EVA days bolder
        if (dayItem.eva) {
          boxSideSize = 4; // Make EVA days slightly larger
        }
      } else {
        dayColor = colors.noData;
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

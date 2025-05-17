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

      drawCircle(uiGroup);
      drawMonthLines(dataGroup);
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

const drawCircle = (group: paper.Group): void => {
  const circle = new paper.Path.Circle(paper.view.center, 50);
  circle.fillColor = new paper.Color("blue");
  group.addChild(circle);
};

function drawMonthLines(group: paper.Group): void {
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

  // Now draw the months and day ticks
  for (const month of allMonths) {
    // Calculate month start position
    const monthStartX = (month.startDay / totalDaysSinceEpoch) * paper.view.bounds.width;

    // Draw day boxes within this month
    for (let day = 1; day <= maxDaysInMonth; day++) {
      // Y position - day 1 at top
      const dayY = paper.view.bounds.top + (day - 1) * dayHeight;

      // Only add day marker if this month actually has this day
      if (day <= month.daysInMonth) {
        // Create a small box for each day
        const boxSideSize = 3;

        const dayBox = new paper.Path.Rectangle({
          point: new paper.Point(monthStartX + 2, dayY + (dayHeight - boxSideSize) / 2),
          size: new paper.Size(boxSideSize, boxSideSize),
          fillColor: new paper.Color(0, 0, 0, 0.7),
          strokeColor: null, // No stroke
        });

        group.addChild(dayBox);
      }
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

import paper from "paper";
import { hhmmssFromAppSeconds, appSecondsFromTimeStr } from "utils/time";
import { extractChannelInfoFromFilename } from "utils/comm";

export const initializePaperCanvas = ({
  canvasElement,
  canvasWidth = 800,
  canvasHeight = 400,
  data,
  onTimelineClick,
  hoverSecondsSetter,
}: {
  canvasElement: HTMLCanvasElement;
  canvasWidth?: number;
  canvasHeight?: number;
  data?: TimelineDayData;
  onTimelineClick: (seconds: number) => void;
  hoverSecondsSetter: (seconds: number | null) => void;
}): {
  drawPaperItems: () => void;
  cleanupInputHandlers: () => void;
  updateCursor: (seconds: number) => void;
  clearHoverCursor: () => void;
} => {
  // Force clear any existing canvas content before creating the project
  const ctx = canvasElement.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  }

  // Create an isolated Paper.js project for this canvas to avoid conflicts with timelineYears
  const project = new paper.Project(canvasElement);

  // Use the project's view and create groups within this project
  const timelineGroup = new paper.Group();
  const clockCursorGroup = new paper.Group(); // Red cursor for clock time
  const hoverCursorGroup = new paper.Group(); // Yellow cursor for hover
  project.activeLayer.addChild(timelineGroup);
  project.activeLayer.addChild(clockCursorGroup);
  project.activeLayer.addChild(hoverCursorGroup);

  // Initialize tool for mouse interaction handling
  let tool: paper.Tool | null = null;

  // Timeline constants
  const SECONDS_IN_24_HOURS = 86400;
  const LEFT_MARGIN = 70; // Space for data labels
  const RIGHT_MARGIN = 5; // Space at the right edge
  const TOP_MARGIN = 0; // No margin at top - start data rows at the very top
  const ROW_HEIGHT = 17.5; // Reduced to fit 4 rows in 70px (100px total - 30px for time ticks)
  const TIMELINE_HEIGHT = 17.5;

  // Data row configuration in requested order
  const DATA_ROWS = [
    { key: "youtubeItems", label: "Video", color: "#dc2626" },
    { key: "photographyItems", label: "Photos", color: "#28B463" },
    { key: "commItems", label: "Comm", color: "#cc5500" },
    { key: "dayNight", label: "Day/Night", color: "#dbc275" },
  ];

  // Channel colors mapping (from comm.module.css)
  const CHANNEL_COLORS = {
    "1": "#1e3a8a", // Channel 1 - Dark Blue
    "2": "#166534", // Channel 2 - Dark Green
    "3": "#991b1b", // Channel 3 - Dark Red
    "4": "#581c87", // Channel 4 - Dark Purple
    "5": "#c2410c", // Channel 5 - Dark Orange
  };

  // Utility functions
  const getTimelineWidth = () => canvasWidth - LEFT_MARGIN - RIGHT_MARGIN;
  const getPixelsPerSecond = () => getTimelineWidth() / SECONDS_IN_24_HOURS;

  // Activate this project to ensure tools work with it
  project.activate();
  tool = new paper.Tool();
  tool.activate();

  // Mouse event handlers
  const handleMouseMove = (event: paper.MouseEvent) => {
    const _timelineWidth = getTimelineWidth();
    const pixelsPerSecond = getPixelsPerSecond();

    // Only check horizontal bounds - allow hover cursor anywhere vertically on canvas
    if (event.point.x < LEFT_MARGIN || event.point.x > LEFT_MARGIN + _timelineWidth) {
      hoverCursorGroup.removeChildren();
      if (project && project.view) {
        project.view.update();
      }
      return;
    }

    const seconds = Math.floor((event.point.x - LEFT_MARGIN) / pixelsPerSecond);
    if (seconds >= 0 && seconds < SECONDS_IN_24_HOURS) {
      drawHoverCursor(seconds);
      hoverSecondsSetter?.(seconds);
    }
  };

  const handleMouseClick = (event: paper.MouseEvent) => {
    const _timelineWidth = getTimelineWidth();
    const pixelsPerSecond = getPixelsPerSecond();

    // Check if click is within the timeline area
    if (event.point.x < LEFT_MARGIN || event.point.x > LEFT_MARGIN + _timelineWidth) {
      return;
    }

    // Check if click is within the data rows area
    const timelineBottom = TOP_MARGIN + DATA_ROWS.length * ROW_HEIGHT;
    if (event.point.y < TOP_MARGIN || event.point.y > timelineBottom) {
      return;
    }

    const seconds = Math.floor((event.point.x - LEFT_MARGIN) / pixelsPerSecond);
    if (seconds >= 0 && seconds < SECONDS_IN_24_HOURS && onTimelineClick) {
      onTimelineClick(seconds);
    }
  };

  const _handleMouseLeave = () => {
    hoverCursorGroup.removeChildren();
    hoverSecondsSetter(null); // Clear hover state in store
  };

  // Set up mouse event handlers
  tool.onMouseMove = handleMouseMove;
  tool.onMouseDown = handleMouseClick;

  // Function to clear hover cursor - will be called from container level
  const clearHoverCursor = () => {
    if (project && project.view) {
      hoverCursorGroup.removeChildren();
      project.view.update();
    }
  };

  const drawTimeTicks = (): paper.Group => {
    const group = new paper.Group();
    const _timelineWidth = getTimelineWidth();
    const pixelsPerSecond = getPixelsPerSecond();
    const timelineBottom = TOP_MARGIN + DATA_ROWS.length * ROW_HEIGHT;

    // Draw time ticks every hour
    for (let hour = 0; hour < 24; hour++) {
      const seconds = hour * 3600;
      const x = LEFT_MARGIN + seconds * pixelsPerSecond;

      // Draw tick line at the bottom
      const tickLine = new paper.Path.Line(
        new paper.Point(x, timelineBottom),
        new paper.Point(x, timelineBottom + 10)
      );
      tickLine.strokeColor = new paper.Color("#505050");
      tickLine.strokeWidth = 1;
      group.addChild(tickLine);

      // Draw hour label below the tick
      const hourText = new paper.PointText({
        point: new paper.Point(x - 6, timelineBottom + 25),
        content: `${hour}Z`,
        fillColor: "#7b7b7b",
        fontSize: 12,
        fontFamily: "Arial, sans-serif",
      });
      group.addChild(hourText);
    }

    return group;
  };

  const drawDataRow = (
    rowIndex: number,
    rowConfig: (typeof DATA_ROWS)[0],
    items: unknown[]
  ): paper.Group => {
    const group = new paper.Group();
    const y = TOP_MARGIN + rowIndex * ROW_HEIGHT;
    const timelineWidth = getTimelineWidth();
    const pixelsPerSecond = getPixelsPerSecond();

    // Draw row label
    const labelText = new paper.PointText({
      point: new paper.Point(LEFT_MARGIN - 10, y + TIMELINE_HEIGHT / 2 + 3),
      content: rowConfig.label,
      fillColor: "#333333",
      fontSize: 12,
      fontFamily: "Arial, sans-serif",
      justification: "right",
    });
    group.addChild(labelText);

    // Draw timeline background
    const timelineBg = new paper.Path.Rectangle(
      new paper.Point(LEFT_MARGIN, y),
      new paper.Size(timelineWidth, TIMELINE_HEIGHT)
    );
    timelineBg.fillColor = new paper.Color("#f0f0f0");
    timelineBg.strokeColor = new paper.Color("#cccccc");
    timelineBg.strokeWidth = 1;
    group.addChild(timelineBg);

    // Ensure items is an array
    const safeItems = items || [];

    // Draw data ticks based on row type
    if (rowConfig.key === "dayNight" && safeItems.length > 0) {
      // Special handling for day/night data - draw segments
      for (let i = 0; i < safeItems.length - 1; i++) {
        const item = safeItems[i] as DayNightObj;
        const nextItem = safeItems[i + 1] as DayNightObj;

        // Use appSeconds which is already in seconds from midnight
        const startSeconds = item.appSeconds;
        const endSeconds = nextItem.appSeconds;

        const startX = LEFT_MARGIN + startSeconds * pixelsPerSecond;
        const endX = LEFT_MARGIN + endSeconds * pixelsPerSecond;

        let fillColor = rowConfig.color;
        if (item.daylight === "night") {
          fillColor = "#000000";
        } else if (item.daylight === "sunrise" || item.daylight === "sunset") {
          fillColor = "#ff8c00";
        }

        const segment = new paper.Path.Rectangle(
          new paper.Point(startX, y + 1),
          new paper.Size(endX - startX, TIMELINE_HEIGHT - 2)
        );
        segment.fillColor = new paper.Color(fillColor);
        group.addChild(segment);
      }
    } else {
      // Draw ticks for other data types
      safeItems.forEach((item: unknown) => {
        let itemTime: Date | null = null;
        let tickColor = rowConfig.color;

        // Extract time based on item type
        if (rowConfig.key === "youtubeItems") {
          const ytItem = item as YoutubeLiveRecording;
          itemTime = new Date(ytItem.startTime);

          // For YouTube items, draw a bar representing the video duration
          if (itemTime && !isNaN(itemTime.getTime())) {
            // Filter by selected date - only show items for the current date
            if (data?.selectedDate) {
              let itemDateStr: string;
              try {
                itemDateStr = itemTime.toISOString().split("T")[0];
              } catch (error) {
                return; // Skip items with invalid dates
              }
              if (itemDateStr !== data.selectedDate) {
                return; // Skip items not for the selected date
              }
            }

            // Get start time in seconds since midnight UTC
            const utcMidnight = new Date(itemTime);
            utcMidnight.setUTCHours(0, 0, 0, 0);
            const startSeconds = (itemTime.getTime() - utcMidnight.getTime()) / 1000;

            // Calculate end time based on duration
            const durationSeconds = ytItem.duration || 0; // Fallback to 0 if no duration
            const endSeconds = startSeconds + durationSeconds;

            // Convert to pixel positions
            const startX = LEFT_MARGIN + startSeconds * pixelsPerSecond;
            const endX = LEFT_MARGIN + endSeconds * pixelsPerSecond;

            // Draw duration bar
            const durationBar = new paper.Path.Rectangle(
              new paper.Point(startX, y + 2),
              new paper.Size(Math.max(endX - startX, 2), TIMELINE_HEIGHT - 4) // Minimum width of 2px
            );
            durationBar.fillColor = new paper.Color(tickColor);
            durationBar.opacity = 0.7;
            group.addChild(durationBar);
          }
          return; // Skip the general date-based processing below
        } else if (rowConfig.key === "photographyItems") {
          const photoItem = item as EarthPhotographyItem;
          itemTime = new Date(photoItem.dateTaken);
        } else if (rowConfig.key === "commItems") {
          const commItem = item as CommItem;
          // For comm items, use utteranceTime directly and get channel-specific color
          const channelInfo = extractChannelInfoFromFilename(commItem.filename);
          if (channelInfo) {
            const channelNumber = channelInfo.number;
            tickColor =
              CHANNEL_COLORS[channelNumber as keyof typeof CHANNEL_COLORS] || rowConfig.color;
          }

          // Convert utteranceTime (HH:MM:SS format) to seconds since midnight
          const seconds = appSecondsFromTimeStr(commItem.utteranceTime);
          const x = LEFT_MARGIN + seconds * pixelsPerSecond;

          // Draw tick mark for comm item
          const tick = new paper.Path.Line(
            new paper.Point(x, y + 1),
            new paper.Point(x, y + TIMELINE_HEIGHT - 1)
          );
          tick.strokeColor = new paper.Color(tickColor);
          tick.strokeWidth = 2;
          group.addChild(tick);
          return; // Skip the date-based processing below
        }

        if (!itemTime || isNaN(itemTime.getTime())) {
          // Skip items with invalid dates
          return;
        }

        // Filter by selected date - only show items for the current date
        if (data?.selectedDate) {
          let itemDateStr: string;
          try {
            itemDateStr = itemTime.toISOString().split("T")[0];
          } catch (error) {
            // Skip items with invalid dates that can't be converted to ISO string
            return;
          }
          if (itemDateStr !== data.selectedDate) {
            return; // Skip items not for the selected date
          }
        }

        // Get seconds since midnight UTC
        const utcMidnight = new Date(itemTime);
        utcMidnight.setUTCHours(0, 0, 0, 0);
        const seconds = (itemTime.getTime() - utcMidnight.getTime()) / 1000;

        const x = LEFT_MARGIN + seconds * pixelsPerSecond;

        // Draw tick mark
        const tick = new paper.Path.Line(
          new paper.Point(x, y + 1),
          new paper.Point(x, y + TIMELINE_HEIGHT - 1)
        );
        tick.strokeColor = new paper.Color(tickColor);
        tick.strokeWidth = 2;
        group.addChild(tick);
      });
    }

    return group;
  };

  const drawClockCursor = (seconds: number): void => {
    clockCursorGroup.removeChildren();

    const x = LEFT_MARGIN + seconds * getPixelsPerSecond();
    const timelineBottom = TOP_MARGIN + DATA_ROWS.length * ROW_HEIGHT;

    // Draw cursor line
    const cursorLine = new paper.Path.Line(
      new paper.Point(x, TOP_MARGIN - 5),
      new paper.Point(x, timelineBottom + 10)
    );
    cursorLine.strokeColor = new paper.Color("#d10b0b"); // Red for clock
    cursorLine.strokeWidth = 2;
    clockCursorGroup.addChild(cursorLine);

    // Draw time display at the bottom, over the time ticks
    const timeText = new paper.PointText({
      point: new paper.Point(x, timelineBottom + 20),
      content: hhmmssFromAppSeconds(seconds) + "Z",
      fillColor: "white",
      fontSize: 14,
      fontFamily: "Arial, sans-serif",
      justification: "center",
    });

    // Background for time text
    const textBg = new paper.Path.Rectangle(
      new paper.Point(x - 40, timelineBottom + 5),
      new paper.Size(80, 20)
    );
    textBg.fillColor = new paper.Color("#d10b0b"); // Red for clock
    textBg.opacity = 0.8;

    clockCursorGroup.addChild(textBg);
    clockCursorGroup.addChild(timeText);

    // Ensure the view is updated after drawing clock cursor
    if (project && project.view) {
      project.view.update();
    }
  };

  const drawHoverCursor = (seconds: number): void => {
    hoverCursorGroup.removeChildren();

    const x = LEFT_MARGIN + seconds * getPixelsPerSecond();
    const timelineBottom = TOP_MARGIN + DATA_ROWS.length * ROW_HEIGHT;

    // Draw cursor line
    const cursorLine = new paper.Path.Line(
      new paper.Point(x, TOP_MARGIN - 5),
      new paper.Point(x, timelineBottom + 10)
    );
    cursorLine.strokeColor = new paper.Color("#ffd700"); // Yellow for hover
    cursorLine.strokeWidth = 2;
    cursorLine.opacity = 0.8; // Slightly transparent
    hoverCursorGroup.addChild(cursorLine);

    // Draw time display at the bottom, over the time ticks
    const timeText = new paper.PointText({
      point: new paper.Point(x, timelineBottom + 20),
      content: hhmmssFromAppSeconds(seconds) + "Z",
      fillColor: "black",
      fontSize: 14,
      fontFamily: "Arial, sans-serif",
      justification: "center",
    });

    // Background for time text - same size as clock cursor
    const textBg = new paper.Path.Rectangle(
      new paper.Point(x - 40, timelineBottom + 5),
      new paper.Size(80, 20)
    );
    textBg.fillColor = new paper.Color("#ffd700"); // Yellow for hover
    textBg.opacity = 0.9;

    hoverCursorGroup.addChild(textBg);
    hoverCursorGroup.addChild(timeText);

    // Ensure the view is updated after drawing hover cursor
    if (project && project.view) {
      project.view.update();
    }
  };

  // Create updateCursor function that can be called externally
  const updateCursor = (seconds: number): void => {
    // Only proceed if project and view are still valid
    if (project && project.view) {
      project.activate();
      // Reactivate the tool to ensure it's bound to the correct project
      if (tool) {
        tool.activate();
      }
      // Ensure seconds is within valid range for a day
      const validSeconds = Math.max(0, Math.min(seconds, SECONDS_IN_24_HOURS - 1));
      drawClockCursor(validSeconds);
    }
  };

  const drawPaperItems = () => {
    if (canvasElement && project && project.view) {
      try {
        // Activate this project before making changes
        project.activate();

        // Reactivate the tool to ensure it's bound to the correct project
        if (tool) {
          tool.activate();
        }

        const displayWidth = canvasWidth;
        const displayHeight = canvasHeight;

        // Set canvas dimensions to match display size
        canvasElement.width = displayWidth;
        canvasElement.height = displayHeight;
        canvasElement.style.width = `${displayWidth}px`;
        canvasElement.style.height = `${displayHeight}px`;

        // Set Paper.js view size to match canvas dimensions
        project.view.viewSize = new paper.Size(displayWidth, displayHeight);

        // Clear existing content
        timelineGroup.removeChildren();
        clockCursorGroup.removeChildren();
        hoverCursorGroup.removeChildren();

        // Force a canvas clear to ensure we start fresh
        const ctx = canvasElement.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, displayWidth, displayHeight);
        }

        // Draw background
        const background = new paper.Path.Rectangle(
          new paper.Point(0, 0),
          new paper.Size(displayWidth, displayHeight)
        );
        background.fillColor = new paper.Color("#ffffff");
        timelineGroup.addChild(background);

        if (data) {
          // Draw time ticks
          timelineGroup.addChild(drawTimeTicks());

          // Draw each data row
          DATA_ROWS.forEach((rowConfig, index) => {
            const items = data[rowConfig.key as keyof TimelineDayData] as unknown[];
            timelineGroup.addChild(drawDataRow(index, rowConfig, items || []));
          });
        } else {
          // Fallback when no data is provided
          const noDataText = new paper.PointText({
            point: new paper.Point(displayWidth / 2, displayHeight / 2),
            content: "No timeline data available",
            fillColor: "#999999",
            fontSize: 14,
            fontFamily: "Arial, sans-serif",
            justification: "center",
          });
          timelineGroup.addChild(noDataText);
        }

        // Force view update and render
        if (project && project.view) {
          project.view.update();
          // Additional render call to ensure the canvas is properly drawn
          if (project.view.element) {
            project.view.requestUpdate();
          }
        }
      } catch (error) {
        console.error("Error in timelineDay drawPaperItems:", error);
      }
    }
  };

  // Initial draw
  drawPaperItems();

  const cleanupInputHandlers = () => {
    // Clear all group children before removing project
    if (timelineGroup) {
      timelineGroup.removeChildren();
    }
    if (clockCursorGroup) {
      clockCursorGroup.removeChildren();
    }
    if (hoverCursorGroup) {
      hoverCursorGroup.removeChildren();
    }

    // Clean up tool
    if (tool) {
      tool.remove();
      tool = null;
    }
    // Remove the project when cleaning up to prevent memory leaks
    if (project) {
      project.remove();
    }
  };

  return { drawPaperItems, cleanupInputHandlers, updateCursor, clearHoverCursor };
};

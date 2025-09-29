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
  paperScope,
  showEarthPhotos = true,
  showMissionPhotos = true,
  showTimelapsePhotos = true,
}: {
  canvasElement: HTMLCanvasElement;
  canvasWidth?: number;
  canvasHeight?: number;
  data?: TimelineDayData;
  onTimelineClick: (seconds: number) => void;
  hoverSecondsSetter: (seconds: number | null) => void;
  paperScope: paper.PaperScope;
  showEarthPhotos?: boolean;
  showMissionPhotos?: boolean;
  showTimelapsePhotos?: boolean;
}): {
  drawPaperItems: () => void;
  cleanupInputHandlers: () => void;
  updateCursor: (seconds: number) => void;
  clearHoverCursor: () => void;
} => {
  // Activate the passed scope immediately for all operations
  paperScope.activate();

  const project = paperScope.project;

  // Use the project's view and create groups within this project
  const timelineGroup = new paperScope.Group();
  const clockCursorGroup = new paperScope.Group(); // Red cursor for clock time
  const hoverCursorGroup = new paperScope.Group(); // Yellow cursor for hover
  project.activeLayer.addChild(timelineGroup);
  project.activeLayer.addChild(clockCursorGroup);
  project.activeLayer.addChild(hoverCursorGroup);

  // Track the last rendered clock cursor so we can restore it after redraws
  let lastClockCursorSeconds: number | null = null;

  // Constants
  const COLORS = {
    clockCursor: "#d10b0b", // Red for clock cursor
    hoverCursor: "#ffd700", // Yellow for hover cursor
    timelineStroke: "#4e5066ff", // for timeline borders
    timelineBackground: "#292b3a", // Grey2 for data row backgrounds
    timeTicks: "#4e5066ff", // for time ticks
    labelText: "#ffffff", // White for all text labels
    nightFill: "#000000", // Black for night segments
    sunriseSunsetFill: "#ff8c00", // Orange for sunrise/sunset segments
    clockCursorText: "white", // White for clock cursor text
    hoverCursorText: "black", // Black for hover cursor text
    commChannel1: "#68bfd7", // Channel 1 primary color
    commChannel2: "#59e1c6", // Channel 2 primary color
    commChannel3: "#df8d8d", // Channel 3 primary color
    commChannel4: "#b374e4", // Channel 4 primary color
    commChannel5: "#ce643b", // Channel 5 primary color
  } as const;

  // Timeline constants
  const SECONDS_IN_24_HOURS = 86400;
  const LEFT_MARGIN = 70; // Space for data labels
  const RIGHT_MARGIN = 5; // Space at the right edge
  const TOP_MARGIN = 0; // No margin at top - start data rows at the very top

  // Data row configuration in requested order with individual heights
  const DATA_ROWS = [
    { key: "videoItems", label: "Video", color: "#dc2626", height: 15 },
    { key: "photos", label: "Photos", color: "#28B463", height: 15 },
    { key: "commItems", label: "Comm", color: null, height: 22 }, // Comm row with 5 subrows
    { key: "dayNight", label: "Day/Night", color: "#dbc275", height: 6 }, // Very thin day/night row
  ];

  // Comm subrow configuration - 5 channels, each with its own subrow
  const COMM_SUBROW_HEIGHT = 4.4; // 22 total height / 5 = 4.4 per subrow
  const COMM_CHANNELS = [
    { number: "1", label: "Ch 1", color: COLORS.commChannel1 },
    { number: "2", label: "Ch 2", color: COLORS.commChannel2 },
    { number: "3", label: "Ch 3", color: COLORS.commChannel3 },
    { number: "4", label: "Ch 4", color: COLORS.commChannel4 },
    { number: "5", label: "Ch 5", color: COLORS.commChannel5 },
  ];

  // Utility functions
  const getTimelineWidth = () => canvasWidth - LEFT_MARGIN - RIGHT_MARGIN;
  const getPixelsPerSecond = () => getTimelineWidth() / SECONDS_IN_24_HOURS;

  // Calculate Y position for a given row index
  const getRowY = (rowIndex: number) => {
    let y = TOP_MARGIN;
    for (let i = 0; i < rowIndex; i++) {
      y += DATA_ROWS[i].height;
    }
    return y;
  };

  // Calculate total height of all data rows
  const getTotalDataRowsHeight = () => {
    return DATA_ROWS.reduce((total, row) => total + row.height, 0);
  };

  // Create tool after scope is activated
  // Tools are automatically associated with the current project when created

  const getRelativePosition = (clientX: number, clientY?: number) => {
    const rect = canvasElement.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: typeof clientY === "number" ? clientY - rect.top : undefined,
    };
  };

  const getSecondsFromClientX = (clientX: number): number | null => {
    const { x } = getRelativePosition(clientX);
    const timelineWidth = getTimelineWidth();
    if (x < LEFT_MARGIN || x > LEFT_MARGIN + timelineWidth) {
      return null;
    }
    const seconds = Math.floor((x - LEFT_MARGIN) / getPixelsPerSecond());
    if (seconds < 0 || seconds >= SECONDS_IN_24_HOURS) {
      return null;
    }
    return seconds;
  };

  const isPointWithinTimeline = (clientX: number, clientY: number): boolean => {
    const { x, y } = getRelativePosition(clientX, clientY);
    const timelineWidth = getTimelineWidth();
    const timelineBottom = TOP_MARGIN + getTotalDataRowsHeight();

    if (x < LEFT_MARGIN || x > LEFT_MARGIN + timelineWidth) {
      return false;
    }

    if (typeof y !== "number") {
      return true;
    }

    return y >= TOP_MARGIN && y <= timelineBottom;
  };

  const removeHoverCursor = () => {
    if (project && project.view) {
      paperScope.activate();
      hoverCursorGroup.removeChildren();

      // Clear canvas and force redraw to remove ghost images
      const ctx = canvasElement.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      }
      // Temporarily clear lastClockCursorSeconds to prevent recursion
      const savedClockSeconds = lastClockCursorSeconds;
      lastClockCursorSeconds = null;
      drawPaperItems();
      lastClockCursorSeconds = savedClockSeconds;
    }
  };

  const applyHoverFromClientX = (clientX: number): number | null => {
    const seconds = getSecondsFromClientX(clientX);
    if (seconds === null) {
      removeHoverCursor();
      return null;
    }

    drawHoverCursor(seconds);
    hoverSecondsSetter?.(seconds);
    return seconds;
  };

  const TAP_MAX_MOVEMENT_PX = 12;
  const TAP_MAX_DURATION_MS = 300;
  let touchStartX: number | null = null;
  let touchStartY: number | null = null;
  let touchStartTime = 0;
  let isTouchDragging = false;
  let lastTouchSeconds: number | null = null;
  let activeTouchId: number | null = null;

  const findTouchById = (touchList: TouchList, id: number | null): Touch | null => {
    if (id === null) {
      return touchList.length ? touchList.item(0) : null;
    }
    for (let i = 0; i < touchList.length; i++) {
      const touch = touchList.item(i);
      if (touch && touch.identifier === id) {
        return touch;
      }
    }
    return null;
  };

  // Mouse event handlers using direct DOM events instead of Paper.js tool events
  const handleCanvasMouseMove = (event: MouseEvent) => {
    if (!project.view) return;

    applyHoverFromClientX(event.clientX);
  };

  const handleCanvasClick = (event: MouseEvent) => {
    if (!project.view) return;

    const seconds = getSecondsFromClientX(event.clientX);
    if (seconds === null) {
      return;
    }

    if (!isPointWithinTimeline(event.clientX, event.clientY)) {
      return;
    }

    if (onTimelineClick) {
      onTimelineClick(seconds);
    }
  };

  const handleCanvasTouchStart = (event: TouchEvent) => {
    if (!project.view || !event.changedTouches.length) return;

    const touch = event.changedTouches[0];
    activeTouchId = touch.identifier;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    isTouchDragging = false;

    const seconds = applyHoverFromClientX(touch.clientX);
    lastTouchSeconds = seconds;
  };

  const handleCanvasTouchMove = (event: TouchEvent) => {
    if (!project.view) return;

    const touch = findTouchById(event.touches, activeTouchId);
    if (!touch) {
      return;
    }

    if (touchStartX !== null && touchStartY !== null && !isTouchDragging) {
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      if (Math.hypot(deltaX, deltaY) > TAP_MAX_MOVEMENT_PX) {
        isTouchDragging = true;
      }
    }

    const seconds = applyHoverFromClientX(touch.clientX);
    lastTouchSeconds = seconds ?? lastTouchSeconds;

    event.preventDefault();
  };

  const handleCanvasTouchEnd = (event: TouchEvent) => {
    if (!project.view) return;

    const touch = findTouchById(event.changedTouches, activeTouchId);
    if (!touch) {
      return;
    }

    const duration = Date.now() - touchStartTime;
    let seconds = getSecondsFromClientX(touch.clientX);
    const releaseWithinTimeline =
      typeof touch.clientY === "number" && isPointWithinTimeline(touch.clientX, touch.clientY);

    if (seconds === null && lastTouchSeconds !== null && releaseWithinTimeline) {
      seconds = lastTouchSeconds;
    }

    if (seconds !== null) {
      lastTouchSeconds = seconds;
    }

    const wasTap = !isTouchDragging && duration <= TAP_MAX_DURATION_MS;
    const shouldClick = seconds !== null && releaseWithinTimeline && (wasTap || isTouchDragging);

    if (shouldClick && seconds !== null && onTimelineClick) {
      onTimelineClick(seconds);
    }

    removeHoverCursor();
    hoverSecondsSetter?.(null);
    lastTouchSeconds = null;

    activeTouchId = null;
    touchStartX = null;
    touchStartY = null;
    touchStartTime = 0;
    isTouchDragging = false;

    event.preventDefault();
  };

  const handleCanvasTouchCancel = () => {
    activeTouchId = null;
    touchStartX = null;
    touchStartY = null;
    touchStartTime = 0;
    isTouchDragging = false;
    lastTouchSeconds = null;
    removeHoverCursor();
    hoverSecondsSetter?.(null);
  };

  // Add event listeners directly to the canvas
  canvasElement.addEventListener("mousemove", handleCanvasMouseMove);
  canvasElement.addEventListener("mousedown", handleCanvasClick); // Using mousedown to match original onMouseDown behavior
  canvasElement.addEventListener("touchstart", handleCanvasTouchStart, { passive: false });
  canvasElement.addEventListener("touchmove", handleCanvasTouchMove, { passive: false });
  canvasElement.addEventListener("touchend", handleCanvasTouchEnd);
  canvasElement.addEventListener("touchcancel", handleCanvasTouchCancel);

  // Function to clear hover cursor - will be called from container level
  const clearHoverCursor = () => {
    removeHoverCursor();
  };

  const drawTimeTicks = (): paper.Group => {
    const group = new paperScope.Group();
    const _timelineWidth = getTimelineWidth();
    const pixelsPerSecond = getPixelsPerSecond();
    const timelineBottom = TOP_MARGIN + getTotalDataRowsHeight();
    const labelEveryOtherHour = canvasWidth < 529;

    // Draw time ticks every hour
    for (let hour = 0; hour < 24; hour++) {
      const seconds = hour * 3600;
      const x = LEFT_MARGIN + seconds * pixelsPerSecond;

      // For hour 0, start tick from halfway down the timeline so the rounded corner isn't spoiled
      const tickStartY = hour === 0 ? TOP_MARGIN + (timelineBottom - TOP_MARGIN) / 2 : TOP_MARGIN;

      // Draw tick line from top of video data line down to bottom
      const tickLine = new paperScope.Path.Line(
        new paperScope.Point(x, tickStartY),
        new paperScope.Point(x, timelineBottom + 10)
      );
      tickLine.strokeColor = new paperScope.Color(COLORS.timeTicks);
      tickLine.strokeWidth = 1;
      group.addChild(tickLine);

      // Draw hour label below the tick
      const shouldRenderHourLabel = !labelEveryOtherHour || hour % 2 === 0;

      if (shouldRenderHourLabel) {
        const hourText = new paperScope.PointText({
          point: new paperScope.Point(x - 6, timelineBottom + 25),
          content: `${hour}`,
          fillColor: COLORS.labelText,
          fontSize: 12,
          fontFamily: "Inter, Arial, sans-serif",
        });
        group.addChild(hourText);
      }
    }

    return group;
  };

  const drawCommSubrows = (
    rowIndex: number,
    rowConfig: (typeof DATA_ROWS)[0],
    items: unknown[]
  ): paper.Group => {
    const group = new paperScope.Group();
    const y = getRowY(rowIndex);
    const timelineWidth = getTimelineWidth();
    const pixelsPerSecond = getPixelsPerSecond();

    // Draw main row label
    const labelText = new paperScope.PointText({
      point: new paperScope.Point(LEFT_MARGIN - 10, y + rowConfig.height / 2 + 3),
      content: rowConfig.label,
      fillColor: COLORS.labelText,
      fontSize: 12,
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: "300",
      justification: "right",
    });
    group.addChild(labelText);

    // Group comm items by channel
    const commItemsByChannel: { [key: string]: CommItem[] } = {};
    const safeItems = items || [];

    safeItems.forEach((item: unknown) => {
      const commItem = item as CommItem;
      const channelInfo = extractChannelInfoFromFilename(commItem.filename);
      if (channelInfo) {
        // Use routingChannel instead of original number - this maps DG/AG to channel 5
        const channelNumber = channelInfo.routingChannel.toString();
        if (!commItemsByChannel[channelNumber]) {
          commItemsByChannel[channelNumber] = [];
        }
        commItemsByChannel[channelNumber].push(commItem);
      }
    });

    // Draw each channel subrow
    COMM_CHANNELS.forEach((channel, subrowIndex) => {
      const subrowY = y + subrowIndex * COMM_SUBROW_HEIGHT;

      // Draw subrow background
      const subrowBg = new paperScope.Path.Rectangle(
        new paperScope.Point(LEFT_MARGIN, subrowY),
        new paperScope.Size(timelineWidth, COMM_SUBROW_HEIGHT)
      );
      subrowBg.fillColor = new paperScope.Color(COLORS.timelineBackground);
      subrowBg.strokeColor = new paperScope.Color(COLORS.timelineStroke);
      subrowBg.strokeWidth = 0.5;
      group.addChild(subrowBg);

      // Draw comm items for this channel
      const channelItems = commItemsByChannel[channel.number] || [];
      channelItems.forEach((commItem: CommItem) => {
        // Convert utteranceTime (HH:MM:SS format) to seconds since midnight
        const seconds = appSecondsFromTimeStr(commItem.utteranceTime);
        const x = LEFT_MARGIN + seconds * pixelsPerSecond;

        // Draw tick mark for comm item in this channel's subrow
        const tick = new paperScope.Path.Line(
          new paperScope.Point(x, subrowY + 0.5),
          new paperScope.Point(x, subrowY + COMM_SUBROW_HEIGHT - 0.5)
        );
        tick.strokeColor = new paperScope.Color(channel.color);
        tick.strokeWidth = 2;
        group.addChild(tick);
      });
    });

    return group;
  };

  const drawDataRow = (
    rowIndex: number,
    rowConfig: (typeof DATA_ROWS)[0],
    items: unknown[]
  ): paper.Group => {
    const group = new paperScope.Group();
    const y = getRowY(rowIndex);
    const rowHeight = rowConfig.height;
    const timelineWidth = getTimelineWidth();
    const pixelsPerSecond = getPixelsPerSecond();

    // Special handling for comm items - draw as subrows
    if (rowConfig.key === "commItems") {
      return drawCommSubrows(rowIndex, rowConfig, items);
    }

    // Draw row label
    const labelText = new paperScope.PointText({
      point: new paperScope.Point(LEFT_MARGIN - 10, y + rowHeight / 2 + 3),
      content: rowConfig.label,
      fillColor: COLORS.labelText,
      fontSize: 12,
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: "300",
      justification: "right",
    });
    group.addChild(labelText);

    // Draw timeline background
    let timelineBg: paper.Path;

    if (rowConfig.key === "videoItems") {
      // Create custom path with rounded top corners only
      const radius = 10;
      timelineBg = new paperScope.Path();

      // Start from bottom left corner
      timelineBg.moveTo(new paperScope.Point(LEFT_MARGIN, y + rowHeight));
      // Left edge up to start of top-left curve
      timelineBg.lineTo(new paperScope.Point(LEFT_MARGIN, y + radius));
      // Top-left rounded corner
      timelineBg.quadraticCurveTo(
        new paperScope.Point(LEFT_MARGIN, y),
        new paperScope.Point(LEFT_MARGIN + radius, y)
      );
      // Top edge to start of top-right curve
      timelineBg.lineTo(new paperScope.Point(LEFT_MARGIN + timelineWidth - radius, y));
      // Top-right rounded corner
      timelineBg.quadraticCurveTo(
        new paperScope.Point(LEFT_MARGIN + timelineWidth, y),
        new paperScope.Point(LEFT_MARGIN + timelineWidth, y + radius)
      );
      // Right edge down to bottom
      timelineBg.lineTo(new paperScope.Point(LEFT_MARGIN + timelineWidth, y + rowHeight));
      // Bottom edge back to start
      timelineBg.lineTo(new paperScope.Point(LEFT_MARGIN, y + rowHeight));
      timelineBg.closePath();
    } else {
      // Regular rectangle for other rows
      timelineBg = new paperScope.Path.Rectangle(
        new paperScope.Point(LEFT_MARGIN, y),
        new paperScope.Size(timelineWidth, rowHeight)
      );
    }

    timelineBg.fillColor = new paperScope.Color(COLORS.timelineBackground);
    timelineBg.strokeColor = new paperScope.Color(COLORS.timelineStroke);
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
          fillColor = COLORS.nightFill;
        } else if (item.daylight === "sunrise" || item.daylight === "sunset") {
          fillColor = COLORS.sunriseSunsetFill;
        }

        const segment = new paperScope.Path.Rectangle(
          new paperScope.Point(startX, y + 1),
          new paperScope.Size(endX - startX, rowHeight - 2)
        );
        segment.fillColor = new paperScope.Color(fillColor);
        group.addChild(segment);
      }
    } else {
      // Draw ticks for other data types
      safeItems.forEach((item: unknown) => {
        let itemTime: Date | null = null;
        let tickColor = rowConfig.color;

        // Extract time based on item type
        if (rowConfig.key === "videoItems") {
          const videoItem = item as TimelineVideoItem;
          const startTimestamp = videoItem.startTimestamp;
          const durationSeconds = videoItem.duration;

          itemTime = new Date(startTimestamp);

          // For video items, draw a bar representing the video duration
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
            const endSeconds = startSeconds + durationSeconds;

            // Convert to pixel positions
            const startX = LEFT_MARGIN + startSeconds * pixelsPerSecond;
            const endX = LEFT_MARGIN + endSeconds * pixelsPerSecond;

            // Draw duration bar
            const durationBar = new paperScope.Path.Rectangle(
              new paperScope.Point(startX, y + 2),
              new paperScope.Size(Math.max(endX - startX, 2), rowHeight - 4) // Minimum width of 2px
            );
            durationBar.fillColor = new paperScope.Color(tickColor);
            durationBar.opacity = 0.7;
            group.addChild(durationBar);
          }
          return; // Skip the general date-based processing below
        } else if (rowConfig.key === "photos") {
          const photoWrapper = item as { item: PhotoItem; source: string };
          const photoItem = photoWrapper.item;
          itemTime = new Date(photoItem.dateTaken);
          // Use different color based on source
          tickColor = photoWrapper.source === "flickr" ? "#28abb4" : "#28B463";
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
        const tick = new paperScope.Path.Line(
          new paperScope.Point(x, y + 1),
          new paperScope.Point(x, y + rowHeight - 1)
        );
        tick.strokeColor = new paperScope.Color(tickColor);
        tick.strokeWidth = 2;
        group.addChild(tick);
      });
    }

    return group;
  };

  const drawClockCursor = (seconds: number): void => {
    // Activate scope before drawing
    paperScope.activate();

    // Clear previous cursor content
    clockCursorGroup.removeChildren();

    const x = LEFT_MARGIN + seconds * getPixelsPerSecond();
    const timelineBottom = TOP_MARGIN + getTotalDataRowsHeight();

    // Draw cursor line
    const cursorLine = new paperScope.Path.Line(
      new paperScope.Point(x, TOP_MARGIN - 5),
      new paperScope.Point(x, timelineBottom + 10)
    );
    cursorLine.strokeColor = new paperScope.Color(COLORS.clockCursor);
    cursorLine.strokeWidth = 2;
    clockCursorGroup.addChild(cursorLine);

    // Draw time display at the bottom of the cursor
    const timeText = new paperScope.PointText({
      point: new paperScope.Point(x, timelineBottom + 20),
      content: hhmmssFromAppSeconds(seconds) + "Z",
      fillColor: COLORS.clockCursorText,
      fontSize: 14,
      fontFamily: "Roboto Mono, Arial, sans-serif",
      justification: "center",
    });

    // Background for time text
    const textBg = new paperScope.Path.Rectangle({
      point: new paperScope.Point(x - 42.5, timelineBottom + 5),
      size: new paperScope.Size(85, 20),
      radius: 4,
      fillColor: new paperScope.Color(COLORS.clockCursor),
    });

    clockCursorGroup.addChild(textBg);
    clockCursorGroup.addChild(timeText);

    // Remember the last drawn position so it can be restored after redraws
    lastClockCursorSeconds = seconds;

    // Force canvas clear and redraw to prevent ghost images
    if (project && project.view) {
      const ctx = canvasElement.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      }
      // Temporarily clear lastClockCursorSeconds to prevent recursion
      const savedSeconds = lastClockCursorSeconds;
      lastClockCursorSeconds = null;
      drawPaperItems();
      lastClockCursorSeconds = savedSeconds;
    }
  };

  const drawHoverCursor = (seconds: number): void => {
    // Activate scope before drawing
    paperScope.activate();

    // Clear previous hover cursor content
    hoverCursorGroup.removeChildren();

    const x = LEFT_MARGIN + seconds * getPixelsPerSecond();
    const timelineBottom = TOP_MARGIN + getTotalDataRowsHeight();

    // Draw cursor line
    const cursorLine = new paperScope.Path.Line(
      new paperScope.Point(x, TOP_MARGIN - 5),
      new paperScope.Point(x, timelineBottom + 10)
    );
    cursorLine.strokeColor = new paperScope.Color(COLORS.hoverCursor);
    cursorLine.strokeWidth = 2;
    cursorLine.opacity = 0.8; // Slightly transparent
    hoverCursorGroup.addChild(cursorLine);

    // Draw time display at the bottom, over the time ticks
    const timeText = new paperScope.PointText({
      point: new paperScope.Point(x, timelineBottom + 20),
      content: hhmmssFromAppSeconds(seconds) + "Z",
      fillColor: COLORS.hoverCursorText,
      fontSize: 14,
      fontFamily: "Roboto Mono, Arial, sans-serif",
      justification: "center",
    });

    // Background for time text - same size as clock cursor
    const textBg = new paperScope.Path.Rectangle({
      point: new paperScope.Point(x - 42.5, timelineBottom + 5),
      size: new paperScope.Size(85, 20),
      radius: 4,
      fillColor: new paperScope.Color(COLORS.hoverCursor),
    });

    hoverCursorGroup.addChild(textBg);
    hoverCursorGroup.addChild(timeText);

    // Force canvas refresh to prevent ghost images during dragging
    if (project && project.view) {
      const ctx = canvasElement.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      }
      // Temporarily clear lastClockCursorSeconds to prevent recursion
      const savedClockSeconds = lastClockCursorSeconds;
      lastClockCursorSeconds = null;
      drawPaperItems();
      lastClockCursorSeconds = savedClockSeconds;
    }
  };

  // Create updateCursor function that can be called externally
  const updateCursor = (seconds: number): void => {
    // Only proceed if project and view are still valid
    if (project && project.view) {
      // Use the dedicated scope instead of global activate
      paperScope.activate();
      // Ensure seconds is within valid range for a day
      const validSeconds = Math.max(0, Math.min(seconds, SECONDS_IN_24_HOURS - 1));
      drawClockCursor(validSeconds);
    }
  };

  const drawPaperItems = () => {
    if (canvasElement && project && project.view) {
      try {
        // Activate the dedicated scope before any drawing operations
        paperScope.activate();

        const displayWidth = canvasWidth;
        const displayHeight = canvasHeight;

        // Get device pixel ratio for high DPI displays
        const devicePixelRatio = window.devicePixelRatio || 1;

        // Set Paper.js view size to match display dimensions (logical pixels)
        project.view.viewSize = new paperScope.Size(displayWidth, displayHeight);

        // Set canvas physical dimensions scaled for high DPI
        canvasElement.width = displayWidth * devicePixelRatio;
        canvasElement.height = displayHeight * devicePixelRatio;

        // CRITICAL: Reset CSS size properties to prevent conflicts with percentage sizing
        canvasElement.style.width = "";
        canvasElement.style.height = "";
        canvasElement.style.maxWidth = "";
        canvasElement.style.maxHeight = "";

        // Set explicit dimensions that work with the CSS container
        canvasElement.style.width = `${displayWidth}px`;
        canvasElement.style.height = `${displayHeight}px`;

        // Reset and scale Paper.js transformation matrix for crisp high DPI rendering
        project.view.matrix = new paperScope.Matrix().scale(devicePixelRatio);

        // Clear existing content but preserve cursor groups
        timelineGroup.removeChildren();

        // Force a canvas clear to ensure we start fresh
        const ctx = canvasElement.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        }

        // Draw background
        const background = new paperScope.Path.Rectangle(
          new paperScope.Point(0, 0),
          new paperScope.Size(displayWidth, displayHeight)
        );
        timelineGroup.addChild(background);

        if (data) {
          // Draw each data row first
          DATA_ROWS.forEach((rowConfig, index) => {
            let items = data[rowConfig.key as keyof TimelineDayData] as unknown[];

            // Special handling for photos row - combine earthPhotos and flickrPhotos with source info
            if (rowConfig.key === "photos") {
              let earthPhotos = showEarthPhotos
                ? ((data.earthPhotos as unknown[]) || []).map((item) => ({
                    item,
                    source: "earth",
                  }))
                : [];
              const flickrPhotos = showMissionPhotos
                ? ((data.flickrPhotos as unknown[]) || []).map((item) => ({
                    item,
                    source: "flickr",
                  }))
                : [];

              // Filter out timelapse photos if showTimelapsePhotos is false
              // Note: Only Earth photos can be timelapse, Flickr photos are never timelapse
              if (!showTimelapsePhotos) {
                earthPhotos = earthPhotos.filter((photoWrapper) => {
                  const photoItem = photoWrapper.item as PhotoItem;
                  return !photoItem.isTimelapse;
                });
              }

              items = [...earthPhotos, ...flickrPhotos] as unknown[];
            }

            timelineGroup.addChild(drawDataRow(index, rowConfig, items || []));
          });

          // Draw time ticks on top of data rows
          timelineGroup.addChild(drawTimeTicks());
        } else {
          // Fallback when no data is provided
          const noDataText = new paperScope.PointText({
            point: new paperScope.Point(displayWidth / 2, displayHeight / 2),
            content: "No timeline data available",
            // fillColor: "#999999",
            fontSize: 14,
            fontFamily: "Inter, Arial, sans-serif",
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

        // After the redraw, restore the clock cursor if we have a previous value
        if (lastClockCursorSeconds !== null) {
          drawClockCursor(lastClockCursorSeconds);
        }
      } catch (error) {
        console.error("Error in timelineDay drawPaperItems:", error);
      }
    } else {
      console.log("drawPaperItems conditions not met:", {
        hasCanvasElement: !!canvasElement,
        hasProject: !!project,
        hasView: !!project?.view,
      });
    }
  };

  // Initial draw
  drawPaperItems();

  const cleanupInputHandlers = () => {
    // Remove canvas event listeners
    canvasElement.removeEventListener("mousemove", handleCanvasMouseMove);
    canvasElement.removeEventListener("mousedown", handleCanvasClick);
    canvasElement.removeEventListener("touchstart", handleCanvasTouchStart);
    canvasElement.removeEventListener("touchmove", handleCanvasTouchMove);
    canvasElement.removeEventListener("touchend", handleCanvasTouchEnd);
    canvasElement.removeEventListener("touchcancel", handleCanvasTouchCancel);

    // Activate scope before cleanup operations
    paperScope.activate();

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

    lastClockCursorSeconds = null;

    // Note: Don't remove the project here - it will be removed by the scope cleanup in the container
  };

  return {
    drawPaperItems,
    cleanupInputHandlers,
    updateCursor,
    clearHoverCursor,
  };
};

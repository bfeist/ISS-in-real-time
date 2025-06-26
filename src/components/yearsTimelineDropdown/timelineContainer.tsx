import React, {
  FunctionComponent,
  JSX,
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import paper from "paper";
import styles from "./timelineContainer.module.css";
import YearsLabels from "./yearsLabels";
import HoverAndSearch from "./subcomponents/hoverAndSearch";
import { initializePaperCanvas, clearPaperCanvas } from "./yearsTimelineDraw";
import { useStateCrewSelection } from "store/hooks/useStateCrewSelection";
import { useStateHover } from "store/hooks/useStateHover";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
import { useStateContentHighlights } from "store/hooks/useStateContentHighlights";
import { useGeneralCrewArrDep, useGeneralDataAvailabilities } from "api/useGeneralData";

const TimelineContainer: FunctionComponent = (): JSX.Element => {
  const dataAvailabilityQuery = useGeneralDataAvailabilities();
  const { data: dataAvailabilityItems, isLoading, error } = dataAvailabilityQuery;
  const { data: crewArrDep } = useGeneralCrewArrDep();

  const { selectedDate, setSelectedDate } = useStateSelectedDate();
  const { hoveredDate, setHoveredDate } = useStateHover();
  const { selectedCrewMember } = useStateCrewSelection();
  const { contentHighlights } = useStateContentHighlights();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const yearsScrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [showTimeline, setShowTimeline] = useState(
    () => selectedDate === null || selectedDate === undefined
  );

  const [canvasWidth, setCanvasWidth] = useState(() => Math.max(window.innerWidth, 1500));
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [isTouchInteraction, setIsTouchInteraction] = useState(false);
  const [pendingTouchDate, setPendingTouchDate] = useState<string | null>(null);

  // Hover callback that was moved from index.tsx
  const hoverCallback = useCallback(
    ({ hoveredDate }: { hoveredDate: string | null }) => {
      // For touch interactions, store as pending date instead of direct hover
      if (isTouchInteraction && hoveredDate) {
        setPendingTouchDate(hoveredDate);
        setHoveredDate(hoveredDate);
      } else if (!isTouchInteraction) {
        // For mouse events, use normal hover behavior
        setHoveredDate(hoveredDate);
        setPendingTouchDate(null);
      }

      // Reset cursor position when no date is hovered
      if (!hoveredDate) {
        setCursorPosition(null);
        setPendingTouchDate(null);
        setIsTouchInteraction(false);
      }
    },
    [isTouchInteraction, setHoveredDate]
  );

  // Wrap the original clickCallback to also close the dropdown
  const handleCanvasClick = useCallback(
    ({ clickedDate }: { clickedDate: string | null }) => {
      // Check if this is a touch device
      const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

      // For touch devices, don't auto-select on click - require using the Go button
      if (isTouchDevice) {
        return;
      }

      // For mouse devices, proceed with normal click behavior
      setSelectedDate(clickedDate);

      // Close the dropdown when a date is selected
      if (clickedDate) {
        setShowTimeline(false);
      }
    },
    [setSelectedDate, setShowTimeline]
  );

  // Handle touch "Go" button click
  const handleTouchGo = useCallback(() => {
    if (pendingTouchDate) {
      setSelectedDate(pendingTouchDate);
      setShowTimeline(false);
      setPendingTouchDate(null);
      setIsTouchInteraction(false);
      setHoveredDate(null);
      setCursorPosition(null);
    }
  }, [pendingTouchDate, setSelectedDate, setHoveredDate]);

  // Handle touch "Cancel" button click
  const handleTouchCancel = useCallback(() => {
    setPendingTouchDate(null);
    setIsTouchInteraction(false);
    setHoveredDate(null);
    setCursorPosition(null);
  }, [setHoveredDate]);

  // Update canvas width on window resize
  useEffect(() => {
    const updateCanvasWidth = () => {
      const windowWidth = window.innerWidth;
      setCanvasWidth(Math.max(windowWidth, 1500));
    };

    window.addEventListener("resize", updateCanvasWidth);

    return () => {
      window.removeEventListener("resize", updateCanvasWidth);
    };
  }, []);

  // Sync scroll between years and canvas
  const handleCanvasScroll = useCallback(() => {
    if (scrollContainerRef.current && yearsScrollContainerRef.current) {
      yearsScrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollLeft;
    }
  }, []);

  const handleYearsScroll = useCallback(() => {
    if (scrollContainerRef.current && yearsScrollContainerRef.current && showTimeline) {
      scrollContainerRef.current.scrollLeft = yearsScrollContainerRef.current.scrollLeft;
    }
  }, [showTimeline]);

  const selectedCrewStays = useMemo(() => {
    if (!crewArrDep || crewArrDep.length === 0 || !selectedCrewMember) return [];
    return crewArrDep.filter(
      (item: CrewArrDepItem) => `${item.name_first} ${item.name_last}` === selectedCrewMember.name
    );
  }, [crewArrDep, selectedCrewMember]);

  // Store the draw function to reuse when timeline becomes visible
  const drawFunctionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas && dataAvailabilityItems) {
      // Initialize canvas regardless of showTimeline state to prevent delay
      const { drawPaperItems, cleanupInputHandlers } = initializePaperCanvas({
        canvasElement: canvas,
        selectedDate,
        dataAvailabilityItems,
        selectedCrewStays,
        contentHighlights,
        hoverCallback,
        clickCallback: handleCanvasClick,
        canvasWidth,
      });

      // Store the draw function for later use
      drawFunctionRef.current = drawPaperItems;

      const handleResize = () => {
        drawPaperItems();
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        cleanupInputHandlers();
        clearPaperCanvas();
        drawFunctionRef.current = null;
      };
    }
  }, [
    dataAvailabilityItems,
    selectedDate,
    selectedCrewStays,
    contentHighlights,
    hoverCallback,
    handleCanvasClick,
    canvasWidth,
  ]);

  // Container-scoped mouse and touch position tracking - more efficient than document level
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updatePosition = (clientX: number, clientY: number) => {
      // Only track when we have a hovered date (tooltip is relevant)
      if (hoveredDate) {
        setCursorPosition({ x: clientX, y: clientY });
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      updatePosition(event.clientX, event.clientY);
      // Reset touch interaction flag when mouse is used
      setIsTouchInteraction(false);
    };

    const handleTouchMove = (event: TouchEvent) => {
      // Use the first touch point
      if (event.touches.length > 0) {
        const touch = event.touches[0];
        updatePosition(touch.clientX, touch.clientY);
        // Set touch interaction flag when touch is detected
        setIsTouchInteraction(true);
      }
    };

    const handleMouseLeave = () => {
      // Clear cursor position when leaving the container
      setCursorPosition(null);
    };

    const handleTouchEnd = () => {
      // For touch interactions, keep the tooltip visible if we have a pending date
      // Only clear position if there's no pending touch date
      if (!pendingTouchDate) {
        setCursorPosition(null);
      }
      // Don't reset isTouchInteraction here - let the buttons handle it
    };

    const handleTouchStart = () => {
      // Set touch interaction flag as soon as touch starts
      setIsTouchInteraction(true);
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd);
    container.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [hoveredDate, pendingTouchDate]); // Only re-setup when hoveredDate or pendingTouchDate changes

  // Update canvas when timeline becomes visible - reinitialize Paper.js properly
  useEffect(() => {
    if (showTimeline && canvasRef.current && dataAvailabilityItems) {
      // When timeline becomes visible, we need to reinitialize the canvas properly
      // because display:none makes Paper.js lose track of dimensions

      const timer = setTimeout(() => {
        const canvas = canvasRef.current;
        if (canvas && drawFunctionRef.current) {
          // Force Paper.js to recognize the canvas is visible again
          if (paper.project && paper.view) {
            // Get actual canvas dimensions now that it's visible
            const displayWidth = Math.max(canvasWidth, 1500);
            const displayHeight = canvas.clientHeight || 150;

            // Update canvas dimensions
            canvas.width = displayWidth;
            canvas.height = displayHeight;
            canvas.style.width = `${displayWidth}px`;
            canvas.style.height = `${displayHeight}px`;

            // Update Paper.js view size
            paper.view.viewSize = new paper.Size(displayWidth, displayHeight);

            // Now redraw
            drawFunctionRef.current();
          }
        }
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [showTimeline, dataAvailabilityItems, canvasWidth]);

  // Format date for tooltip display
  const formatTooltipDate = useCallback((dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        weekday: "short",
      });
    } catch {
      return dateString;
    }
  }, []);

  // Calculate tooltip position
  const getTooltipStyle = useCallback((): React.CSSProperties => {
    if (!cursorPosition || !hoveredDate) {
      return { pointerEvents: "none", visibility: "hidden" };
    }

    const offset = 10;
    const tooltipElement = tooltipRef.current;
    // Adjust height estimate for touch tooltip with buttons
    const tooltipHeight = tooltipElement
      ? tooltipElement.offsetHeight || (isTouchInteraction ? 80 : 50)
      : isTouchInteraction
        ? 80
        : 50;
    const tooltipWidth = tooltipElement
      ? tooltipElement.offsetWidth || (isTouchInteraction ? 200 : 180)
      : isTouchInteraction
        ? 200
        : 180;

    // Get container position for relative boundary calculation
    const container = containerRef.current;
    const containerRect = container ? container.getBoundingClientRect() : null;
    const containerTop = containerRect ? containerRect.top : 0;

    let x = cursorPosition.x + offset;
    let y = cursorPosition.y - tooltipHeight - offset; // Default to above cursor

    // Check if tooltip would be too close to top of viewport OR container
    const topBoundary = Math.max(
      window.scrollY + 20, // Viewport boundary
      containerTop + 10 // Container boundary
    );

    if (y < topBoundary) {
      y = cursorPosition.y + offset; // Switch to below cursor
    }

    // Check if tooltip would go off bottom of viewport
    const bottomBoundary = window.scrollY + window.innerHeight - tooltipHeight - 20;
    if (y > bottomBoundary) {
      y = cursorPosition.y - tooltipHeight - offset; // Force above cursor
    }

    // Check if tooltip would go off right edge of screen
    if (x + tooltipWidth > window.innerWidth) {
      x = cursorPosition.x - tooltipWidth - offset; // Switch to left side
    }

    // Check if tooltip would go off left edge of screen
    if (x < 10) {
      x = 10; // Keep it on screen
    }

    return {
      left: `${x}px`,
      top: `${y}px`,
      visibility: "visible",
      pointerEvents: isTouchInteraction ? "auto" : "none", // Enable pointer events for touch interactions
    };
  }, [cursorPosition, hoveredDate, isTouchInteraction]);

  // Update showTimeline when selectedDate changes
  useEffect(() => {
    // If selectedDate is null/undefined, default to open
    if (selectedDate === null || selectedDate === undefined) {
      setShowTimeline(true);
    }
  }, [selectedDate]);

  // Handle loading state
  if (isLoading) {
    return (
      <div className={styles.timelineContainer}>
        <div className={styles.yearsRow}>
          <div className={styles.loadingMessage}>Loading timeline data...</div>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className={styles.timelineContainer}>
        <div className={styles.yearsRow}>
          <div className={styles.errorMessage}>Error loading timeline data: {error.message}</div>
        </div>
      </div>
    );
  }

  // Handle no data
  if (!dataAvailabilityItems || dataAvailabilityItems.length === 0) {
    return (
      <div className={styles.timelineContainer}>
        <div className={styles.yearsRow}>
          <div className={styles.noDataMessage}>No timeline data available.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Floating date tooltip - always render it but control visibility with CSS */}
      <div ref={tooltipRef} className={styles.dateTooltip} style={getTooltipStyle()}>
        {hoveredDate && (
          <>
            <div className={styles.tooltipDate}>{formatTooltipDate(hoveredDate)}</div>
            {isTouchInteraction && (
              <div className={styles.tooltipButtons}>
                <button className={styles.tooltipGoButton} onClick={handleTouchGo} type="button">
                  Go
                </button>
                <button
                  className={styles.tooltipCancelButton}
                  onClick={handleTouchCancel}
                  type="button"
                  title="Close"
                >
                  ×
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div
        ref={containerRef}
        className={styles.timelineContainer}
        onMouseEnter={() => {
          /* Keep timeline open when mouse enters container */
        }}
      >
        {/* Years labels row */}
        <div className={styles.yearsRow}>
          <div
            ref={yearsScrollContainerRef}
            className={styles.yearsScrollContainer}
            onScroll={handleYearsScroll}
          >
            <YearsLabels
              canvasWidth={canvasWidth}
              onClick={() => {
                // Toggle timeline visibility
                setShowTimeline(!showTimeline);
              }}
              hoveredDate={hoveredDate}
              selectedDate={selectedDate}
            />
          </div>
        </div>

        {/* Timeline canvas dropdown */}
        <div className={`${styles.timelineDropdown} ${!showTimeline ? styles.hidden : ""}`}>
          <div
            ref={scrollContainerRef}
            className={styles.canvasScrollContainer}
            onScroll={handleCanvasScroll}
          >
            <canvas ref={canvasRef} className={styles.timelineCanvas} style={{ height: 150 }} />
          </div>
          <HoverAndSearch />
        </div>
      </div>
    </>
  );
};

export default TimelineContainer;

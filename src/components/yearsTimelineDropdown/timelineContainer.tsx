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
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

  // Hover callback that was moved from index.tsx
  const hoverCallback = useCallback(
    ({ hoveredDate }: { hoveredDate: string | null }) => {
      // Store the hovered date in state
      setHoveredDate(hoveredDate);

      // Reset mouse position when no date is hovered
      if (!hoveredDate) {
        setMousePosition(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // setHoveredDate is stable from Zustand, no need to include in deps
  );

  // Wrap the original clickCallback to also close the dropdown
  const handleCanvasClick = useCallback(
    ({ clickedDate }: { clickedDate: string | null }) => {
      // Call the original click callback
      setSelectedDate(clickedDate);

      // Close the dropdown when a date is selected
      if (clickedDate) {
        setShowTimeline(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setShowTimeline] // Only include React state setters, Zustand setters are stable
  );

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

  // Container-scoped mouse position tracking - more efficient than document level
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (event: MouseEvent) => {
      // Only track when we have a hovered date (tooltip is relevant)
      if (hoveredDate) {
        setMousePosition({ x: event.clientX, y: event.clientY });
      }
    };

    const handleMouseLeave = () => {
      // Clear mouse position when leaving the container
      setMousePosition(null);
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [hoveredDate]); // Only re-setup when hoveredDate changes

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
    if (!mousePosition || !hoveredDate) {
      return { pointerEvents: "none", visibility: "hidden" };
    }

    const offset = 10;
    let x = mousePosition.x + offset;
    let y = mousePosition.y - 40; // Default to above mouse

    // Check if tooltip would be too close to top of screen
    if (y < 50) {
      y = mousePosition.y + offset; // Switch to below mouse
    }

    // Check if tooltip would go off right edge of screen
    if (x + 200 > window.innerWidth) {
      x = mousePosition.x - 200 - offset; // Switch to left side
    }
    console.log(`Tooltip position: x=${x}, y=${y}, hoveredDate=${hoveredDate}`);

    return {
      left: `${x}px`,
      top: `${y}px`,
      visibility: "visible",
    };
  }, [mousePosition, hoveredDate]);

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
        {hoveredDate ? formatTooltipDate(hoveredDate) : ""}
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

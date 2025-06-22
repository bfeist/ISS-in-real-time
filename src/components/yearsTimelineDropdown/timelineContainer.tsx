import { FunctionComponent, JSX, useRef, useEffect, useState, useCallback } from "react";
import styles from "./timelineContainer.module.css";
import YearsLabels from "./yearsLabels";
import HoverAndSearch from "./subcomponents/hoverAndSearch";
import { initializePaperCanvas, clearPaperCanvas } from "./yearsTimelineDraw";
import { useStateHover, useStateSelectedDate } from "store";
import { useGeneralDataAvailabilities } from "api/useGeneralData";

const TimelineContainer: FunctionComponent = (): JSX.Element => {
  const dataAvailabilityQuery = useGeneralDataAvailabilities();
  const { data: dataAvailabilityItems, isLoading, error } = dataAvailabilityQuery;

  const { selectedDate, setSelectedDate } = useStateSelectedDate();
  const { hoveredDate, setHoveredDate } = useStateHover();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const yearsScrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedCrewMember, setSelectedCrewMember] = useState<CrewMember | null>(null);
  const [selectedCrewStays, setSelectedCrewStays] = useState<CrewArrDepItem[]>([]);
  const [showTimeline, setShowTimeline] = useState(
    () => selectedDate === null || selectedDate === undefined
  );
  const [isDefaultOpen, setIsDefaultOpen] = useState(
    () => selectedDate === null || selectedDate === undefined
  );
  const [canvasWidth, setCanvasWidth] = useState(() => Math.max(window.innerWidth, 1500));

  // Hover callback that was moved from index.tsx
  const hoverCallback = useCallback(
    ({ hoveredDate }: { hoveredDate: string | null }) => {
      // Store the hovered date in state
      setHoveredDate(hoveredDate);
    },
    [setHoveredDate]
  );

  // Wrap the original clickCallback to also close the dropdown
  const handleCanvasClick = useCallback(
    ({ clickedDate }: { clickedDate: string | null }) => {
      // Call the original click callback
      setSelectedDate(clickedDate);

      // Close the dropdown when a date is selected
      if (clickedDate) {
        setShowTimeline(false);
        setIsDefaultOpen(false);
      }
    },
    [setSelectedDate]
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

  const handleYearsHover = useCallback((isHovering: boolean) => {
    if (isHovering) {
      setShowTimeline(true);
    }
    // Don't set to false here - let the container mouse leave handle it
  }, []);

  // Handle mouse leave from the entire timeline container
  const handleContainerMouseLeave = useCallback(() => {
    // Only close if it wasn't default opened
    if (!isDefaultOpen) {
      setShowTimeline(false);
    }
  }, [isDefaultOpen]);

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

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas && showTimeline && dataAvailabilityItems) {
      // Use the current canvasWidth state which matches years labels
      const { drawPaperItems, cleanupInputHandlers } = initializePaperCanvas({
        canvasElement: canvas,
        dataAvailabilityItems,
        selectedCrewStays,
        hoverCallback,
        clickCallback: handleCanvasClick,
        canvasWidth,
      });

      // Update canvas element width to match calculated width
      canvas.style.width = `${canvasWidth}px`;

      const handleResize = () => {
        drawPaperItems();
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        cleanupInputHandlers();
        clearPaperCanvas();
      };
    }
  }, [
    dataAvailabilityItems,
    selectedCrewStays,
    hoverCallback,
    handleCanvasClick,
    showTimeline,
    canvasWidth,
  ]);

  // Update canvas width when canvasWidth state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && showTimeline) {
      canvas.style.width = `${canvasWidth}px`;
      canvas.width = canvasWidth; // Also set the actual canvas width attribute
    }
  }, [canvasWidth, showTimeline]);

  // Update showTimeline when selectedDate changes
  useEffect(() => {
    // If selectedDate is null/undefined, default to open
    if (selectedDate === null || selectedDate === undefined) {
      setShowTimeline(true);
      setIsDefaultOpen(true);
    } else {
      // If a date is selected, we can close the timeline (user has made a selection)
      // but don't force it closed - let hover behavior control it
      setIsDefaultOpen(false);
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
    <div
      ref={containerRef}
      className={styles.timelineContainer}
      onMouseEnter={() => {
        /* Keep timeline open when mouse enters container */
      }}
      onMouseLeave={handleContainerMouseLeave}
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
            onHover={handleYearsHover}
            onClick={() => {
              // When clicking on years labels, we can close the timeline if it was open
              if (showTimeline) {
                setShowTimeline(false);
                setIsDefaultOpen(false);
              } else {
                setShowTimeline(true);
                setIsDefaultOpen(true);
              }
            }}
            hoveredDate={hoveredDate}
            selectedDate={selectedDate}
          />
        </div>
      </div>

      {/* Timeline canvas dropdown */}
      {showTimeline && (
        <div className={styles.timelineDropdown}>
          <div
            ref={scrollContainerRef}
            className={styles.canvasScrollContainer}
            onScroll={handleCanvasScroll}
          >
            <canvas ref={canvasRef} className={styles.timelineCanvas} style={{ height: 150 }} />
          </div>
          <HoverAndSearch
            selectedCrewMember={selectedCrewMember}
            setSelectedCrewMember={setSelectedCrewMember}
            selectedCrewStays={selectedCrewStays}
            setSelectedCrewStays={setSelectedCrewStays}
          />
        </div>
      )}
    </div>
  );
};

export default TimelineContainer;

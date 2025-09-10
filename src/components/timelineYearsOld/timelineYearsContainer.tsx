import React, { FunctionComponent, JSX, useRef, useEffect, useState, useCallback } from "react";
import paper from "paper";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import styles from "./timelineYearsContainer.module.css";
import YearsLabels from "./yearsLabels";
import ControlsHeader from "../timelineYears/controlsHeader/controlsHeader";
import SearchComponent from "components/timelineYears/subcomponents/highlightData";
import LayoutTestComponent from "components/timelineYears/subcomponents/layoutTestComponent";
import DateTooltip from "../timelineYears/dateTooltip/dateTooltip";
import OpenCloseIndicators from "./openCloseIndicators";
import { initializePaperCanvas } from "./timelineYearsDraw";
import { calculateOptimalMaxWidth, calculateMinimumWidth } from "../../utils/indexSliderCalcs";
import { useStateHover } from "store/hooks/useStateHover";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateContentHighlights } from "store/hooks/useStateContentHighlights";
import { useStateToggle } from "store/hooks/useStateToggle";
import { useCommFirstData, useGeneralDataAvailabilities } from "api/useGeneralData";
import { useParams } from "react-router-dom";

// Configure dayjs to use UTC plugin
dayjs.extend(utc);

const TimelineYearsContainer: FunctionComponent = (): JSX.Element => {
  const dataAvailabilityQuery = useGeneralDataAvailabilities();
  const {
    data: dataAvailabilityItems,
    isLoading: isLoadingDataAvailability,
    error,
  } = dataAvailabilityQuery;
  const { data: commFirstData, isLoading: isLoadingCommFirst } = useCommFirstData();
  const { dateTimeSlug } = useParams();

  // Check if any of the required data is still loading
  const isLoading = isLoadingDataAvailability || isLoadingCommFirst;

  const { selectedDate, setSelectedDate } = useStateClock();
  const { hoveredDate, setHoveredDate } = useStateHover();
  const { contentHighlights } = useStateContentHighlights();
  const { showTimelineYears, setShowTimelineYears, hoveringYearsLabels, setHoveringYearsLabels } =
    useStateToggle();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scopeRef = useRef<paper.PaperScope | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const yearsScrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [canvasWidth, setCanvasWidth] = useState(() => {
    const windowWidth = window.innerWidth;
    const optimalMaxWidth = calculateOptimalMaxWidth();
    const minimumWidth = calculateMinimumWidth();

    // Use browser width normally, but constrain between min and max
    if (windowWidth < minimumWidth) {
      // Browser too narrow - use minimum width (will scroll)
      return minimumWidth;
    } else if (windowWidth > optimalMaxWidth) {
      // Browser very wide - cap at maximum width (will be centered)
      return optimalMaxWidth;
    } else {
      // Normal case - use browser width
      return windowWidth;
    }
  });
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [isTouchInteraction, setIsTouchInteraction] = useState(false);
  const [pendingTouchDate, setPendingTouchDate] = useState<string | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Scroll arrow interaction states
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize showTimeline state based on selectedDate and dateTimeSlug
  useEffect(() => {
    // Don't open timeline by default if there was a dateTimeSlug parameter
    if (dateTimeSlug) {
      setShowTimelineYears(false);
    } else {
      // Otherwise, open if no date is selected
      setShowTimelineYears(selectedDate === null || selectedDate === undefined);
    }
  }, [dateTimeSlug, selectedDate, setShowTimelineYears]); // Run when dependencies change

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

      // Stop any playing audio when a date is selected
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      // Close the dropdown when a date is selected
      if (clickedDate) {
        setShowTimelineYears(false);
      }
    },
    [setSelectedDate, setShowTimelineYears]
  );

  // Handle touch "Go" button click
  const handleTouchGo = useCallback(() => {
    if (pendingTouchDate) {
      setSelectedDate(pendingTouchDate);
      setShowTimelineYears(false);
      setPendingTouchDate(null);
      setIsTouchInteraction(false);
      setHoveredDate(null);
      setCursorPosition(null);

      // Stop any playing audio when a date is selected
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [pendingTouchDate, setSelectedDate, setHoveredDate, setShowTimelineYears]);

  // Handle touch "Cancel" button click
  const handleTouchCancel = useCallback(() => {
    setPendingTouchDate(null);
    setIsTouchInteraction(false);
    setHoveredDate(null);
    setCursorPosition(null);
  }, [setHoveredDate]);

  const stopScrolling = useCallback(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }, []);

  // Arrow scroll functions
  const startScrolling = useCallback(
    (direction: "left" | "right", container: "years" | "canvas") => {
      const scrollAmount = 20; // pixels per interval
      const intervalDelay = 50; // milliseconds

      const containerRef = container === "years" ? yearsScrollContainerRef : scrollContainerRef;

      const scroll = () => {
        if (containerRef.current) {
          const currentScroll = containerRef.current.scrollLeft;
          const newScroll =
            direction === "left"
              ? Math.max(0, currentScroll - scrollAmount)
              : currentScroll + scrollAmount;

          containerRef.current.scrollLeft = newScroll;

          // Stop scrolling if we've reached the end
          if (direction === "right") {
            const maxScroll = containerRef.current.scrollWidth - containerRef.current.clientWidth;
            if (newScroll >= maxScroll) {
              stopScrolling();
            }
          } else if (newScroll <= 0) {
            stopScrolling();
          }
        }
      };

      // Clear any existing interval
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }

      // Start scrolling immediately, then continue with interval
      scroll();
      scrollIntervalRef.current = setInterval(scroll, intervalDelay);
    },
    [stopScrolling]
  );

  // Update canvas width on window resize
  useEffect(() => {
    const updateCanvasWidth = () => {
      const windowWidth = window.innerWidth;
      const optimalMaxWidth = calculateOptimalMaxWidth();
      const minimumWidth = calculateMinimumWidth();

      // Use browser width normally, but constrain between min and max
      if (windowWidth < minimumWidth) {
        // Browser too narrow - use minimum width (will scroll)
        setCanvasWidth(minimumWidth);
      } else if (windowWidth > optimalMaxWidth) {
        // Browser very wide - cap at maximum width (will be centered)
        setCanvasWidth(optimalMaxWidth);
      } else {
        // Normal case - use browser width
        setCanvasWidth(windowWidth);
      }
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
    if (scrollContainerRef.current && yearsScrollContainerRef.current && showTimelineYears) {
      scrollContainerRef.current.scrollLeft = yearsScrollContainerRef.current.scrollLeft;
    }
  }, [showTimelineYears]);

  // Store the draw function to reuse when timeline becomes visible
  const drawFunctionRef = useRef<(() => void) | null>(null);
  const cleanupInputHandlersRef = useRef<(() => void) | null>(null);

  // Single effect to handle all canvas initialization and updates
  useEffect(() => {
    const canvas = canvasRef.current;

    // Only initialize canvas when all data is loaded
    if (canvas && dataAvailabilityItems && !isLoading) {
      // Only create scope if it doesn't exist yet
      if (!scopeRef.current) {
        scopeRef.current = new paper.PaperScope();
        scopeRef.current.setup(canvas);
      }

      // Always clean up input handlers before reinitializing
      if (cleanupInputHandlersRef.current) {
        cleanupInputHandlersRef.current();
      }

      // Ensure proper canvas sizing before initializing
      const displayWidth = canvasWidth;
      const displayHeight = canvas.clientHeight || 150;
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      // Activate the scope and clear existing content without destroying the scope
      scopeRef.current.activate();
      if (scopeRef.current.project && scopeRef.current.project.activeLayer) {
        scopeRef.current.project.activeLayer.removeChildren();
      }

      // Initialize canvas with the existing scope
      const { drawPaperItems, cleanupInputHandlers } = initializePaperCanvas({
        canvasElement: canvas,
        selectedDate,
        dataAvailabilityItems,
        selectedCrewStays: [],
        contentHighlights,
        hoverCallback,
        clickCallback: handleCanvasClick,
        canvasWidth,
        paperScope: scopeRef.current,
      });

      // Store the draw function for later use
      drawFunctionRef.current = drawPaperItems;
      cleanupInputHandlersRef.current = cleanupInputHandlers;

      // Draw immediately
      drawPaperItems();

      const handleResize = () => {
        if (drawFunctionRef.current) {
          drawFunctionRef.current();
        }
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        if (cleanupInputHandlersRef.current) {
          cleanupInputHandlersRef.current();
        }
        // Don't destroy the scope on every change - only clear the references
        drawFunctionRef.current = null;
        cleanupInputHandlersRef.current = null;
      };
    }

    // Cleanup function for when component unmounts completely
    return () => {
      if (cleanupInputHandlersRef.current) {
        cleanupInputHandlersRef.current();
      }
      if (scopeRef.current && scopeRef.current.project) {
        scopeRef.current.project.remove();
        scopeRef.current = null;
      }
      drawFunctionRef.current = null;
      cleanupInputHandlersRef.current = null;
    };
  }, [
    dataAvailabilityItems,
    isLoading,
    selectedDate,
    contentHighlights,
    hoverCallback,
    handleCanvasClick,
    canvasWidth,
  ]);

  // Debounced audio playback when hoveredDate changes
  useEffect(() => {
    if (!hoveredDate || !commFirstData || !audioRef.current || !showTimelineYears) {
      return;
    }

    // Create a debounce timer
    const timer = setTimeout(() => {
      const audioData = commFirstData[hoveredDate];
      if (audioData && audioData.filename) {
        const audioElement = audioRef.current;
        if (audioElement) {
          // Parse the hovered date to get year, month, day
          const date = dayjs.utc(hoveredDate);
          const year = date.format("YYYY");
          const month = date.format("MM");
          const day = date.format("DD");

          // Construct the full URL for the audio file
          const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL || "";
          const audioUrl = `${baseStaticUrl}/comm/${year}/${month}/${day}/${audioData.filename}`;

          // Stop any currently playing audio
          audioElement.pause();
          audioElement.currentTime = 0;

          // Set new source and play
          audioElement.src = audioUrl;

          // Only try to play if user has interacted with the page
          if (hasUserInteracted) {
            audioElement.play().catch((error) => {
              // Silently handle the error - this is expected behavior for hover audio
              if (error.name !== "NotAllowedError") {
                console.warn("Failed to play audio:", error);
              }
            });
          }
        }
      }
    }, 1000); // 1 second debounce

    // Cleanup function to clear the timer
    return () => {
      clearTimeout(timer);
    };
  }, [hoveredDate, commFirstData, hasUserInteracted, showTimelineYears]);

  // Track user interaction to enable audio playback
  useEffect(() => {
    const enableAudio = () => {
      setHasUserInteracted(true);
    };

    // Listen for various user interaction events
    document.addEventListener("click", enableAudio, { once: true });
    document.addEventListener("keydown", enableAudio, { once: true });
    document.addEventListener("touchstart", enableAudio, { once: true });

    return () => {
      document.removeEventListener("click", enableAudio);
      document.removeEventListener("keydown", enableAudio);
      document.removeEventListener("touchstart", enableAudio);
    };
  }, []);

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

      // Stop audio playback when mouse leaves the container
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
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

  // Update canvas when timeline becomes visible
  useEffect(() => {
    if (showTimelineYears && canvasRef.current && dataAvailabilityItems && !isLoading) {
      const canvas = canvasRef.current;
      if (canvas && drawFunctionRef.current && scopeRef.current) {
        // Ensure the scope is active when timeline becomes visible
        scopeRef.current.activate();

        // Use the scope's view
        if (scopeRef.current.view) {
          // Get actual canvas dimensions now that it's visible
          const displayWidth = canvasWidth; // Use the calculated canvas width directly
          const displayHeight = canvas.clientHeight || 150;

          // Update canvas dimensions
          canvas.width = displayWidth;
          canvas.height = displayHeight;
          canvas.style.width = `${displayWidth}px`;
          canvas.style.height = `${displayHeight}px`;

          // Update Paper.js view size for this specific scope
          scopeRef.current.view.viewSize = new paper.Size(displayWidth, displayHeight);

          // Now redraw
          drawFunctionRef.current();
        }
      }
    }
  }, [
    showTimelineYears,
    dataAvailabilityItems,
    canvasWidth,
    isLoading,
    contentHighlights,
    selectedDate,
  ]);

  // Helper function to render content with or without wrapper
  const renderWithOptionalWrapper = (content: React.ReactNode) => {
    if (canvasWidth <= window.innerWidth) {
      // Normal case or centering case - use wrapper
      return (
        <div
          className={styles.timelineContentWrapper}
          style={{
            width: `${canvasWidth}px`,
            margin: canvasWidth < window.innerWidth ? "0 auto" : "0",
          }}
        >
          {content}
        </div>
      );
    } else {
      // Narrow window case - no wrapper, direct scroll containers
      return <>{content}</>;
    }
  };

  // Helper function to render content with or without wrapper

  // Update showTimeline when selectedDate changes
  useEffect(() => {
    // If selectedDate is null/undefined, default to open (unless there was a dateTimeSlug)
    if (selectedDate === null || selectedDate === undefined) {
      // Don't auto-open if there was a dateTimeSlug parameter
      if (!dateTimeSlug) {
        setShowTimelineYears(true);
      }
    }
  }, [selectedDate, dateTimeSlug, setShowTimelineYears]);

  // Cleanup scroll interval on unmount
  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, []);

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
      {/* Floating date tooltip */}
      <DateTooltip
        hoveredDate={hoveredDate}
        cursorPosition={cursorPosition}
        isTouchInteraction={isTouchInteraction}
        onTouchGo={handleTouchGo}
        onTouchCancel={handleTouchCancel}
        containerRef={containerRef}
      />

      <div
        ref={containerRef}
        className={styles.timelineContainer}
        onMouseEnter={() => {
          /* Keep timeline open when mouse enters container */
        }}
      >
        {/* Years labels row */}
        <div className={styles.yearsRow}>
          {renderWithOptionalWrapper(
            <>
              {/* Scroll arrows for years */}
              <div
                className={`${styles.scrollArrow} ${styles.scrollArrowLeft}`}
                onMouseDown={() => startScrolling("left", "years")}
                onMouseUp={stopScrolling}
                onMouseLeave={stopScrolling}
                onTouchStart={() => startScrolling("left", "years")}
                onTouchEnd={stopScrolling}
                role="button"
                tabIndex={0}
                aria-label="Scroll years left"
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </div>
              <div
                className={`${styles.scrollArrow} ${styles.scrollArrowRight}`}
                onMouseDown={() => startScrolling("right", "years")}
                onMouseUp={stopScrolling}
                onMouseLeave={stopScrolling}
                onTouchStart={() => startScrolling("right", "years")}
                onTouchEnd={stopScrolling}
                role="button"
                tabIndex={0}
                aria-label="Scroll years right"
              >
                <FontAwesomeIcon icon={faChevronRight} />
              </div>

              <div
                ref={yearsScrollContainerRef}
                className={styles.yearsScrollContainer}
                onScroll={handleYearsScroll}
                onMouseEnter={() => setHoveringYearsLabels(true)}
                onMouseLeave={() => setHoveringYearsLabels(false)}
              >
                <YearsLabels
                  canvasWidth={canvasWidth}
                  onClick={() => {
                    setShowTimelineYears(!showTimelineYears);
                  }}
                  hoveredDate={hoveredDate}
                  selectedDate={selectedDate}
                />
                {!showTimelineYears && hoveringYearsLabels && (
                  <OpenCloseIndicators
                    isOpen={showTimelineYears}
                    onToggle={() => setShowTimelineYears(!showTimelineYears)}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Controls below labels when closed */}
        {!showTimelineYears && renderWithOptionalWrapper(<ControlsHeader />)}

        {/* Timeline canvas dropdown */}
        <div className={`${styles.timelineDropdown} ${!showTimelineYears ? styles.hidden : ""}`}>
          {renderWithOptionalWrapper(
            <>
              <div
                ref={scrollContainerRef}
                className={styles.canvasScrollContainer}
                onScroll={handleCanvasScroll}
              >
                <canvas ref={canvasRef} className={styles.timelineCanvas} style={{ height: 150 }} />
              </div>
              <div className={styles.componentsContainer}>
                <SearchComponent />
                <LayoutTestComponent />
              </div>
              <OpenCloseIndicators
                isOpen={showTimelineYears}
                onToggle={() => setShowTimelineYears(!showTimelineYears)}
              />
              {/* Controls inside dropdown when open */}
              <ControlsHeader />
            </>
          )}
        </div>
      </div>

      {/* Hidden audio element for playing communication first recordings */}
      <audio ref={audioRef} preload="none" style={{ display: "none" }}>
        <track kind="captions" srcLang="en" label="English" default />
      </audio>
    </>
  );
};

export default TimelineYearsContainer;

import { useRef, useEffect, useState, useCallback } from "react";
import styles from "./timelineDayContainer.module.css";
import { initializePaperCanvas } from "./timelineDayDraw";
import {
  useDateCommTranscript,
  useDateEarthPhotography,
  useDatePhotosFlickr,
} from "api/useDateSpecificData";
import { useGeneralVideoIa, useGeneralVideoYt } from "api/useGeneralData";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateHover } from "store/hooks/useStateHover";
import { useStateToggle } from "store/hooks/useStateToggle";
import { useStateDayNight } from "store/hooks/useStateDayNight";
import paper from "paper";

const TimelineDayContainer = (): JSX.Element => {
  const { selectedDate, setClock, appSecondsAtStartStop, isRunning, startStopTimestamp } =
    useStateClock();
  const { setHoverSeconds } = useStateHover();
  const { showEarthPhotos, showMissionPhotos, showTimelapsePhotos } = useStateToggle();
  const { dayNight } = useStateDayNight();
  const { data: commItems = [], isLoading: isLoadingComm } = useDateCommTranscript(
    selectedDate || ""
  );
  const { data: earthPhotos = [], isLoading: isLoadingPhotography } = useDateEarthPhotography(
    selectedDate || ""
  );
  const { data: flickrPhotos = [], isLoading: isLoadingPhotographyFlickr } = useDatePhotosFlickr(
    selectedDate || "",
    true
  );

  const { data: videoYt = [], isLoading: isLoadingYt } = useGeneralVideoYt();
  const { data: videoIa = [], isLoading: isLoadingIa } = useGeneralVideoIa();

  // Check if any critical data is still loading
  const isLoading =
    isLoadingComm ||
    isLoadingPhotography ||
    isLoadingPhotographyFlickr ||
    isLoadingYt ||
    isLoadingIa;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const scopeRef = useRef<paper.PaperScope | null>(null);
  const isInitializedRef = useRef<boolean>(false); // Track initialization state

  const [canvasWidth, setCanvasWidth] = useState(() => window.innerWidth);
  const canvasHeight = 90; // Fixed height for now

  // Store the draw function to reuse when needed - following timelineYears pattern
  const drawFunctionRef = useRef<(() => void) | null>(null);
  const updateCursorRef = useRef<((seconds: number) => void) | null>(null);
  const clearHoverCursorRef = useRef<(() => void) | null>(null);

  // Clock interval effect - similar to ClockInterval component
  const lastSecondsRef = useRef<number>(-1);

  useEffect(() => {
    if (isRunning) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          const secondsSinceStarted = (Date.now() - Date.parse(startStopTimestamp)) / 1000;
          const newAppSeconds = Math.floor(appSecondsAtStartStop + secondsSinceStarted);
          const secondsInDay = newAppSeconds % 86400;

          // Only update cursor if the second has actually changed
          if (updateCursorRef.current && secondsInDay !== lastSecondsRef.current) {
            lastSecondsRef.current = secondsInDay;
            updateCursorRef.current(secondsInDay);
          }
        }, 100);
      }
    } else {
      const secondsSinceStarted = (Date.now() - Date.parse(startStopTimestamp)) / 1000;
      const newAppSeconds = Math.floor(appSecondsAtStartStop + secondsSinceStarted);
      const secondsInDay = newAppSeconds % 86400;

      // Update cursor position for paused state only if seconds changed
      if (updateCursorRef.current && secondsInDay !== lastSecondsRef.current) {
        lastSecondsRef.current = secondsInDay;
        updateCursorRef.current(secondsInDay);
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [appSecondsAtStartStop, isRunning, startStopTimestamp]);

  // Update canvas width on window resize - following timelineYears pattern
  useEffect(() => {
    const updateCanvasWidth = () => {
      const container = containerRef.current;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const width = Math.max(containerRect.width || container.clientWidth || 800, 300);
        setCanvasWidth(width);
      }
    };

    window.addEventListener("resize", updateCanvasWidth);

    return () => {
      window.removeEventListener("resize", updateCanvasWidth);
    };
  }, []);

  // Handle mouse leave to clear hover cursor
  const handleMouseLeave = useCallback(() => {
    // Always clear hover state in Zustand store
    setHoverSeconds(null);

    // Use a small timeout to ensure Paper.js refs are available
    setTimeout(() => {
      if (clearHoverCursorRef.current) {
        clearHoverCursorRef.current();
      }
    }, 0);
  }, [setHoverSeconds]);

  // Container-scoped mouse event handling - similar to timelineYears pattern
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [handleMouseLeave]);

  // Initialize Paper.js canvas with dedicated scope
  useEffect(() => {
    // Function to initialize canvas when conditions are met
    const initializeCanvas = () => {
      const canvas = canvasRef.current;

      // Check all conditions
      if (!canvas || !selectedDate || isLoadingComm || isLoadingPhotography || isLoadingYt) {
        return false;
      }

      // Prevent multiple initializations - check if already initialized
      if (isInitializedRef.current && scopeRef.current) {
        return true; // Already initialized
      }

      // Clean up any existing scope before creating new ones
      if (scopeRef.current) {
        if (scopeRef.current.project) {
          scopeRef.current.project.remove();
        }
        scopeRef.current = null;
      }

      // Create a dedicated scope for this canvas
      scopeRef.current = new paper.PaperScope();
      scopeRef.current.setup(canvas);

      // Activate the scope
      scopeRef.current.activate();

      isInitializedRef.current = true;

      const videoItems: TimelineVideoItem[] = [];

      // convert yt data to timeline format
      videoYt.forEach((item) => {
        if (item.ytStartTime && item.duration) {
          videoItems.push({
            startTimestamp: item.derivedStartTime || item.ytStartTime,
            duration: item.duration,
          });
        }
      });
      // convert ia data to timeline format
      videoIa.forEach((item) => {
        if (item.date && item.time && item.duration) {
          const startTimestamp = `${item.date}T${item.time}Z`;
          videoItems.push({
            startTimestamp,
            duration: item.duration,
          });
        }
      });

      const timelineData: TimelineDayData = {
        commItems,
        earthPhotos,
        flickrPhotos,
        videoItems,
        dayNight,
        selectedDate: selectedDate || "",
      };

      const { drawPaperItems, updateCursor, clearHoverCursor } = initializePaperCanvas({
        canvasElement: canvas,
        canvasWidth,
        canvasHeight,
        data: timelineData,
        onTimelineClick: setClock,
        hoverSecondsSetter: setHoverSeconds,
        paperScope: scopeRef.current,
        showEarthPhotos,
        showMissionPhotos,
        showTimelapsePhotos,
      });

      // Store the draw function for later use
      drawFunctionRef.current = drawPaperItems;
      updateCursorRef.current = updateCursor;
      clearHoverCursorRef.current = clearHoverCursor;

      // Restore the current clock cursor immediately after reinitialization
      const startStopMillis = Date.parse(startStopTimestamp);
      const hasValidTimestamp = !Number.isNaN(startStopMillis);

      let currentSecondsInDay: number | null = null;

      if (hasValidTimestamp) {
        const secondsSinceStarted = (Date.now() - startStopMillis) / 1000;
        const newAppSeconds = Math.floor(appSecondsAtStartStop + secondsSinceStarted);
        currentSecondsInDay = ((newAppSeconds % 86400) + 86400) % 86400;
      } else if (Number.isFinite(appSecondsAtStartStop)) {
        currentSecondsInDay = ((Math.floor(appSecondsAtStartStop) % 86400) + 86400) % 86400;
      }

      if (updateCursorRef.current && currentSecondsInDay !== null) {
        updateCursorRef.current(currentSecondsInDay);
        lastSecondsRef.current = currentSecondsInDay;
      }

      const handleResize = () => {
        if (drawFunctionRef.current) {
          drawFunctionRef.current();
        }
      };

      window.addEventListener("resize", handleResize);
      return true;
    };

    // Try to initialize immediately
    if (initializeCanvas()) {
      return () => {
        // Cleanup function for successful initialization
        if (scopeRef.current) {
          window.removeEventListener("resize", () => {
            if (drawFunctionRef.current) {
              drawFunctionRef.current();
            }
          });

          if (scopeRef.current.project) {
            scopeRef.current.project.remove();
          }
          scopeRef.current = null;
          isInitializedRef.current = false;
        }

        drawFunctionRef.current = null;
        updateCursorRef.current = null;
        clearHoverCursorRef.current = null;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }

    // If immediate initialization failed, try with polling until canvas is ready
    const pollInterval = setInterval(() => {
      if (initializeCanvas()) {
        clearInterval(pollInterval);
      }
    }, 100);

    return () => {
      clearInterval(pollInterval);
      // Cleanup any existing scope
      if (scopeRef.current) {
        if (scopeRef.current.project) {
          scopeRef.current.project.remove();
        }
        scopeRef.current = null;
        isInitializedRef.current = false;
      }
      drawFunctionRef.current = null;
      updateCursorRef.current = null;
      clearHoverCursorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canvasWidth,
    canvasHeight,
    selectedDate,
    setClock,
    setHoverSeconds,
    isLoadingComm,
    isLoadingPhotography,
    isLoadingYt,
    showEarthPhotos,
    showMissionPhotos,
    showTimelapsePhotos,
    appSecondsAtStartStop,
    startStopTimestamp,
  ]); // Put loading states back in dependencies

  // Separate effect to redraw when data changes (but not toggle changes)
  useEffect(() => {
    // Only redraw if we have the canvas setup and data is ready
    // Note: Toggle changes are handled in the initialization effect above
    if (
      drawFunctionRef.current &&
      !isLoadingComm &&
      !isLoadingPhotography &&
      !isLoadingYt &&
      !isLoadingIa &&
      selectedDate
    ) {
      drawFunctionRef.current();
    }
  }, [
    commItems,
    earthPhotos,
    flickrPhotos,
    videoYt,
    videoIa,
    dayNight,
    isLoadingComm,
    isLoadingPhotography,
    isLoadingYt,
    isLoadingIa,
    selectedDate,
    // Note: showEarthPhotos and showMissionPhotos are NOT included here
    // because toggle changes trigger re-initialization, not just redraw
  ]);

  // Force redraw on mount to handle hot reload scenarios
  useEffect(() => {
    if (drawFunctionRef.current) {
      drawFunctionRef.current();
    }
  }, []);

  // Show loading state if critical data is still loading
  if (isLoading && selectedDate) {
    return (
      <div ref={containerRef} className={styles.container}>
        <div style={{ padding: "20px", textAlign: "center" }}>Loading timeline data...</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} width={canvasWidth} height={canvasHeight} />
    </div>
  );
};

export default TimelineDayContainer;

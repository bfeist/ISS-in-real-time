import { FunctionComponent, useRef, useEffect, useState, useMemo } from "react";
import styles from "./timelineDayContainer.module.css";
import { initializePaperCanvas } from "./timelineDayDraw";
import {
  useDateEphemera,
  useDateCommTranscript,
  useDateEarthPhotography,
} from "api/useDateSpecificData";
import { useGeneralYoutubeData } from "api/useGeneralData";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
import { calcDayNight } from "utils/day-night";
import { findClosestEphemeraItem } from "utils/map";

const TimelineDayContainer: FunctionComponent = (): JSX.Element => {
  const { selectedDate } = useStateSelectedDate();
  const { data: ephemeraItems = [], isLoading: isLoadingEphemera } = useDateEphemera(
    selectedDate || ""
  );
  const { data: commItems = [], isLoading: isLoadingComm } = useDateCommTranscript(
    selectedDate || ""
  );
  const { data: photographyItems = [], isLoading: isLoadingPhotography } = useDateEarthPhotography(
    selectedDate || ""
  );
  const { data: youtubeItems = [], isLoading: isLoadingYoutube } = useGeneralYoutubeData();

  // Check if any critical data is still loading
  const isLoading = isLoadingEphemera || isLoadingComm || isLoadingPhotography || isLoadingYoutube;

  const dayNight = useMemo(() => {
    if (!ephemeraItems || ephemeraItems.length === 0 || !selectedDate) return [];
    const ephemeris = findClosestEphemeraItem(new Date(`${selectedDate}T12:00:00Z`), ephemeraItems);
    const tle = `${ephemeris.tle_line1}
                 ${ephemeris.tle_line2}`;
    const result = calcDayNight(tle, selectedDate);
    return result;
  }, [ephemeraItems, selectedDate]);

  // Log data for debugging (will be used for rendering later)
  useEffect(() => {
    if (selectedDate) {
      console.log("Timeline Day Data for", selectedDate, {
        isLoading,
        dataLoaded: {
          ephemeraItems: ephemeraItems.length,
          commItems: commItems.length,
          photographyItems: photographyItems.length,
          youtubeItems: youtubeItems.length,
          dayNightSegments: dayNight.length,
        },
      });
    }
  }, [selectedDate, isLoading, ephemeraItems, commItems, photographyItems, youtubeItems, dayNight]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [canvasWidth, setCanvasWidth] = useState(() => window.innerWidth);
  const canvasHeight = 100; // Fixed height for now

  // Store the draw function to reuse when needed - following timelineYears pattern
  const drawFunctionRef = useRef<(() => void) | null>(null);

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

  // Initialize Paper.js canvas - single initialization following timelineYears pattern
  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas) {
      const timelineData: TimelineDayData = {
        commItems,
        photographyItems,
        youtubeItems,
        dayNight,
        selectedDate: selectedDate || "",
      };

      const { drawPaperItems, cleanupInputHandlers } = initializePaperCanvas({
        canvasElement: canvas,
        canvasWidth,
        canvasHeight,
        data: timelineData,
      });

      // Store the draw function for later use
      drawFunctionRef.current = drawPaperItems;

      const handleResize = () => {
        // Just redraw with the existing Paper.js setup
        if (drawFunctionRef.current) {
          drawFunctionRef.current();
        }
      };

      window.addEventListener("resize", handleResize);

      return () => {
        cleanupInputHandlers();
        window.removeEventListener("resize", handleResize);
        drawFunctionRef.current = null;
      };
    }
  }, [
    canvasWidth,
    canvasHeight,
    ephemeraItems,
    commItems,
    photographyItems,
    youtubeItems,
    dayNight,
    selectedDate,
  ]); // Re-initialize when dimensions or data change

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
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
};

export default TimelineDayContainer;

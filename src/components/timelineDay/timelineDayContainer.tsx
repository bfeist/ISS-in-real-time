import { FunctionComponent, useRef, useEffect, useState, useMemo } from "react";
import styles from "./timelineDayContainer.module.css";
import { initializePaperCanvas } from "./timelineDayDraw";
import { useDateEphemera } from "api/useDateSpecificData";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
import { calcDayNight } from "utils/day-night";

const TimelineDayContainer: FunctionComponent = (): JSX.Element => {
  const { selectedDate } = useStateSelectedDate();
  const { data: ephemeraItems = [], isLoading: _isLoading } = useDateEphemera(selectedDate || "");

  const _dayNight = useMemo(() => {
    if (!ephemeraItems || ephemeraItems.length === 0) return [];
    const result = calcDayNight(ephemeraItems, selectedDate);
    console.log("Day/Night Data:", result);
    return result;
  }, [ephemeraItems, selectedDate]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [canvasWidth, setCanvasWidth] = useState(() => window.innerWidth);
  const canvasHeight = 70; // Fixed height for now

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
      const { drawPaperItems, cleanupInputHandlers } = initializePaperCanvas({
        canvasElement: canvas,
        canvasWidth,
        canvasHeight,
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
  }, [canvasWidth, canvasHeight]); // Re-initialize when dimensions change

  // Force redraw on mount to handle hot reload scenarios
  useEffect(() => {
    if (drawFunctionRef.current) {
      drawFunctionRef.current();
    }
  }, []);

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
};

export default TimelineDayContainer;

import styles from "./index_slider.module.css";
import { FunctionComponent, JSX, useEffect, useRef, useState, useCallback } from "react";
import { initializePaperCanvas, clearPaperCanvas } from "../components/dateTimelineDraw";
import { calculateMonthByX } from "../utils/indexSliderCalcs";
import { useLoaderData } from "react-router";

const SliderPage: FunctionComponent = (): JSX.Element => {
  const dataAvailabilityItems = useLoaderData() as DataAvailability[];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  const [calculatedDate, setCalculatedDate] = useState<{ year: number; month: number } | null>(
    null
  );

  const handleCanvasCallback = useCallback((content: CanvasCallbackContent) => {
    if (content.mouseX !== null && content.mouseY !== null) {
      setMousePosition({ x: content.mouseX, y: content.mouseY });
    } else {
      setMousePosition(null);
    }

    // Calculate date here
    if (content.mouseX !== null && content.canvasWidth !== null) {
      const date = calculateMonthByX(content.mouseX, content.canvasWidth);
      setCalculatedDate(date);
    } else {
      setCalculatedDate(null);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const { drawPaperItems, cleanupInputHandlers } = initializePaperCanvas({
        canvasElement: canvas,
        onMouseMoveCallback: handleCanvasCallback,
        dataAvailabilityItems,
      });

      window.addEventListener("resize", drawPaperItems);

      return () => {
        window.removeEventListener("resize", drawPaperItems);
        cleanupInputHandlers();
        clearPaperCanvas();
      };
    }
  }, [handleCanvasCallback, dataAvailabilityItems]);

  return (
    <div className={styles.page}>
      <canvas ref={canvasRef} className={styles.paperCanvas} />
      {mousePosition && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            color: "white",
            backgroundColor: "rgba(0,0,0,0.5)",
            padding: "5px",
            zIndex: 10, // Ensure it's above the canvas
          }}
        >
          Mouse X: {mousePosition.x.toFixed(2)}, Mouse Y: {mousePosition.y.toFixed(2)}
          {calculatedDate && (
            <>
              <br />
              Year: {calculatedDate.year}, Month: {calculatedDate.month + 1}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SliderPage;

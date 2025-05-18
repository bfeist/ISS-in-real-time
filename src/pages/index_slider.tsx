import styles from "./index_slider.module.css";
import { FunctionComponent, JSX, useEffect, useRef, useState, useCallback } from "react";
import { initializePaperCanvas, clearPaperCanvas } from "../components/dateTimelineDraw";
import { calculateMonthByX, calculateDayByY } from "../utils/indexSliderCalcs";
import { useLoaderData } from "react-router";
import paper from "paper";

const SliderPage: FunctionComponent = (): JSX.Element => {
  const getDataIndexPageData = useLoaderData() as GetDataIndexPageDataResponse;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [calculatedDate, setCalculatedDate] = useState<{
    year: number;
    month: number;
    day: number | null;
  } | null>(null);

  const handleCanvasCallback = useCallback(
    ({
      mouseX,
      mouseY,
      canvasWidth,
    }: {
      mouseX: number | null;
      mouseY: number | null;
      canvasWidth: number | null;
    }) => {
      // Calculate date here
      if (mouseX !== null && mouseY !== null && canvasWidth !== null) {
        const monthInfo = calculateMonthByX(mouseX, canvasWidth);

        if (monthInfo) {
          const day = calculateDayByY(
            mouseY,
            paper.view?.bounds.height ?? null,
            monthInfo.year,
            monthInfo.month
          );
          setCalculatedDate({ ...monthInfo, day });
        } else {
          setCalculatedDate(null);
        }
      } else {
        setCalculatedDate(null);
      }
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const { drawPaperItems, cleanupInputHandlers } = initializePaperCanvas({
        canvasElement: canvas,
        handleCanvasCallback,
        dataAvailabilityItems: getDataIndexPageData.dataAvailabilityItems,
      });

      window.addEventListener("resize", drawPaperItems);

      return () => {
        window.removeEventListener("resize", drawPaperItems);
        cleanupInputHandlers();
        clearPaperCanvas();
      };
    }
  }, [handleCanvasCallback, getDataIndexPageData.dataAvailabilityItems]);

  return (
    <div className={styles.page}>
      <canvas ref={canvasRef} className={styles.paperCanvas} />
      {calculatedDate && (
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
          Year: {calculatedDate.year}, Month: {calculatedDate.month + 1}, Day: {calculatedDate.day}
        </div>
      )}
    </div>
  );
};

export default SliderPage;

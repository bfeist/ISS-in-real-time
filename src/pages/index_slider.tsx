import styles from "./index_slider.module.css";
import { FunctionComponent, JSX, useEffect, useRef, useState } from "react";
import { initializePaperCanvas, clearPaperCanvas } from "../components/dateTimelineDraw";

const SliderPage: FunctionComponent = (): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePosition, setMousePosition] = useState<paper.Point | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const { resizeHandler, cleanupInputHandlers } = initializePaperCanvas(
        canvas,
        setMousePosition
      );

      window.addEventListener("resize", resizeHandler);

      return () => {
        window.removeEventListener("resize", resizeHandler);
        cleanupInputHandlers();
        clearPaperCanvas();
      };
    }
  }, []);

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
          }}
        >
          Mouse X: {mousePosition.x.toFixed(2)}, Mouse Y: {mousePosition.y.toFixed(2)}
        </div>
      )}
    </div>
  );
};

export default SliderPage;

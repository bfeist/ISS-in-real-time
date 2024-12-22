import { FunctionComponent, useEffect, useRef, useState } from "react";
import styles from "./images.module.css";
import { useClockContext } from "context/clockContext";
import { appSecondsFromTimeStr } from "utils/time";

const Images: FunctionComponent<{
  imageItems: ImageItem[];
}> = ({ imageItems }) => {
  const imageBaseUrl = import.meta.env.VITE_IMAGE_BASE_URL;

  const { clock, setClock } = useClockContext();

  const [visibleImages, setVisibleImages] = useState<number[]>([]);
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute("data-index") || "0", 10);
            setVisibleImages((prev) => [...prev, index]);
            observer.current?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = document.querySelectorAll(".lazy-load");
    elements.forEach((el) => observer.current?.observe(el));

    return () => {
      observer.current?.disconnect();
    };
  }, [imageItems]);

  useEffect(() => {
    if (!clock.appSeconds) return;

    // Find the closest image to the current time (before the current time)
    let closestImageItem = imageItems[0] || null;
    if (!closestImageItem) return;

    let appSecondsDiff = null;
    for (const imageItem of imageItems) {
      const imageSeconds = appSecondsFromTimeStr(imageItem.dateTaken.split("T")[1]);
      if (imageSeconds > clock.appSeconds) {
        break;
      }
      const diff = Math.abs(clock.appSeconds - imageSeconds);
      if (appSecondsDiff === null || diff < appSecondsDiff) {
        appSecondsDiff = diff;
        closestImageItem = imageItem;
      }
    }

    const closestImageTimeStr = closestImageItem.dateTaken.split("T")[1];

    const targetElement = document.querySelector(`[data-time="${closestImageTimeStr}"]`);
    targetElement?.scrollIntoView({ behavior: "smooth" });
  }, [clock.appSeconds, imageItems]);

  return (
    <div className={styles.images}>
      {imageItems.map((item, index) => (
        <div
          key={index}
          className={`${styles.imageItem} lazy-load`}
          data-index={index}
          data-time={item.dateTaken.split("T")[1]}
        >
          <div
            className={styles.dateTaken}
            role="button"
            tabIndex={0}
            onClick={() => {
              setClock((prev) => ({
                ...prev,
                appSeconds: appSecondsFromTimeStr(item.dateTaken.split("T")[1]),
              }));
            }}
            onKeyUp={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setClock((prev) => ({
                  ...prev,
                  appSeconds: appSecondsFromTimeStr(item.dateTaken.split("T")[1]),
                }));
              }
            }}
          >
            {item.dateTaken}
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => window.open(`${imageBaseUrl}/${item.largeUrl}`, "_blank")}
            onKeyUp={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                window.open(`${imageBaseUrl}/${item.largeUrl}`, "_blank");
              }
            }}
          >
            {visibleImages.includes(index) && (
              <img src={`${imageBaseUrl}/${item.smallUrl}`} alt={item.ID} loading="lazy" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Images;

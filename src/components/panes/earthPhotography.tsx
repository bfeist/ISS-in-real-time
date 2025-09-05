import { FunctionComponent, useEffect, useRef, useState } from "react";
import styles from "./earthPhotography.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";
import { useDateEarthPhotography } from "api/useDateSpecificData";

const EarthPhotography: FunctionComponent<{ height?: "tall" | "short" }> = ({
  height = "short",
}) => {
  const { selectedDate, setClock } = useStateClock();
  const { data: imageItems = [], isLoading } = useDateEarthPhotography(selectedDate || "");

  const imageBaseUrl = import.meta.env.VITE_IMAGE_BASE_URL.replace("\\x3a", ":");

  const [visibleImages, setVisibleImages] = useState<Set<number>>(new Set());
  const [appSeconds, setAppSeconds] = useState(0);
  const [mostRecentImage, setMostRecentImage] = useState(null);

  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute("data-index") || "0", 10);
            setVisibleImages((prev) => new Set(prev).add(index));
            observer.current?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    // Observe all thumbnail containers (they all exist now as placeholders)
    const elements = document.querySelectorAll(".lazy-load");
    elements.forEach((el) => observer.current?.observe(el));

    return () => {
      observer.current?.disconnect();
    };
  }, [imageItems]);

  useEffect(() => {
    if (!appSeconds) return;

    // Find the closest image to the current time (before the current time)
    let closestImageItem = imageItems[0] || null;
    if (!closestImageItem) return;

    let appSecondsDiff = null;
    for (const imageItem of imageItems) {
      const imageSeconds = appSecondsFromTimeStr(imageItem.dateTaken.split("T")[1]);
      if (imageSeconds > appSeconds) {
        break;
      }
      const diff = Math.abs(appSeconds - imageSeconds);
      if (appSecondsDiff === null || diff <= appSecondsDiff) {
        appSecondsDiff = diff;
        closestImageItem = imageItem;
      }
    }

    const closestImageTimeStr = closestImageItem.dateTaken.split("T")[1];

    const targetElement = document.querySelector(`[data-time="${closestImageTimeStr}"]`);
    targetElement?.scrollIntoView({ behavior: "smooth" });

    if (closestImageItem.ID !== mostRecentImage?.ID) {
      setMostRecentImage(closestImageItem);
    }
  }, [appSeconds, imageItems, mostRecentImage]);

  if (isLoading) {
    return <div>Loading Earth photography...</div>;
  }
  return (
    <div className={styles.imageComponentContainer}>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <div
        className={styles.currentImage}
        style={height === "short" ? { maxHeight: "35vh" } : undefined}
        role="button"
        tabIndex={0}
        onClick={() => window.open(`${imageBaseUrl}/${mostRecentImage?.largeUrl}`, "_blank")}
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            window.open(`${imageBaseUrl}/${mostRecentImage?.largeUrl}`, "_blank");
          }
        }}
      >
        {mostRecentImage && (
          <img
            src={`${imageBaseUrl}/${mostRecentImage.largeUrl}`}
            alt={mostRecentImage.ID}
            loading="lazy"
          />
        )}
      </div>
      <div className={styles.imageThumbsContainer}>
        {imageItems.map((item, index) => (
          <div
            key={index}
            className={`${styles.imageThumb} ${mostRecentImage?.ID === item.ID ? styles.active : ""} lazy-load`}
            data-index={index}
            data-time={item.dateTaken.split("T")[1]}
          >
            <div
              className={styles.thumbContent}
              role="button"
              tabIndex={0}
              onClick={() => {
                setClock(appSecondsFromTimeStr(item.dateTaken.split("T")[1]));
              }}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setClock(appSecondsFromTimeStr(item.dateTaken.split("T")[1]));
                }
              }}
            >
              {visibleImages.has(index) ? (
                <img src={`${imageBaseUrl}/${item.smallUrl}`} alt={item.ID} loading="lazy" />
              ) : (
                <div className={styles.thumbPlaceholder} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EarthPhotography;

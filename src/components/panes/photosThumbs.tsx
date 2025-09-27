import { FunctionComponent, useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsSpin } from "@fortawesome/free-solid-svg-icons";
import styles from "./photosThumbs.module.css";
import { appSecondsFromTimeStr } from "utils/time";

interface PhotosThumbsProps {
  photoItemsCombined: PhotoItem[];
  appSeconds: number;
  mostRecentImage: PhotoItem | null;
  clickedPhotoFilename: string | null;
  lastAppSeconds: number | null;
  isAutoScrollEnabled: boolean;
  getImageUrl: (photoItem: PhotoItem, size: "thumb" | "medium" | "large") => string;
  onThumbnailClick: (item: PhotoItem) => void;
  onAutoScrollToggle: (enabled: boolean) => void;
  onDisableAutoScroll: () => void;
  setClickedPhotoFilename: (filename: string | null) => void;
  setLastAppSeconds: (seconds: number | null) => void;
}

const PhotosThumbs: FunctionComponent<PhotosThumbsProps> = ({
  photoItemsCombined,
  appSeconds,
  mostRecentImage,
  clickedPhotoFilename,
  lastAppSeconds,
  isAutoScrollEnabled,
  getImageUrl,
  onThumbnailClick,
  onAutoScrollToggle,
  onDisableAutoScroll,
  setClickedPhotoFilename,
  setLastAppSeconds,
}) => {
  // State
  const [visibleImages, setVisibleImages] = useState<Set<number>>(new Set());

  // Refs (only for values that don't trigger re-renders)
  const observer = useRef<IntersectionObserver | null>(null);
  const thumbnailsContainerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollingRef = useRef(false);
  const isPointerDownRef = useRef(false);

  // Auto-scroll management
  const disableAutoScroll = useCallback(() => {
    if (isAutoScrollEnabled && !isProgrammaticScrollingRef.current) {
      onDisableAutoScroll();
    }
  }, [isAutoScrollEnabled, onDisableAutoScroll]);

  // Intersection Observer for lazy loading
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

    const elements = document.querySelectorAll(".lazy-load");
    elements.forEach((el) => observer.current?.observe(el));

    return () => {
      observer.current?.disconnect();
    };
  }, [photoItemsCombined]);

  // Scroll event detection
  useEffect(() => {
    const container = thumbnailsContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (!isProgrammaticScrollingRef.current) {
        disableAutoScroll();
      }
    };

    const handleWheel = () => disableAutoScroll();
    const handleTouchStart = () => disableAutoScroll();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
        ].includes(e.key)
      ) {
        disableAutoScroll();
      }
    };

    const handlePointerDown = () => {
      isPointerDownRef.current = true;
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("keydown", handleKeyDown);
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointerup", handlePointerUp);
    container.addEventListener("touchstart", handleTouchStart, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("keydown", handleKeyDown);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("touchstart", handleTouchStart);
    };
  }, [photoItemsCombined, disableAutoScroll]);

  // Auto-scroll to current image
  useEffect(() => {
    if (!appSeconds) return;

    // Clear clicked photo state when time changes
    if (lastAppSeconds !== null && lastAppSeconds !== appSeconds && clickedPhotoFilename) {
      setClickedPhotoFilename(null);
    }
    setLastAppSeconds(appSeconds);

    // Find images at current time or closest before
    const imagesAtCurrentTime = photoItemsCombined.filter((imageItem) => {
      const imageSeconds = appSecondsFromTimeStr(imageItem.dateTaken.split("T")[1]);
      return imageSeconds === appSeconds;
    });

    let closestImageItem = null;

    if (imagesAtCurrentTime.length > 0) {
      // Prioritize clicked image if available
      if (clickedPhotoFilename) {
        const clickedImage = imagesAtCurrentTime.find((img) => img.ID === clickedPhotoFilename);
        closestImageItem = clickedImage || imagesAtCurrentTime[0];
      } else {
        closestImageItem = imagesAtCurrentTime[0];
      }
    } else {
      // Find closest image before current time
      closestImageItem = photoItemsCombined[0] || null;
      if (closestImageItem) {
        let appSecondsDiff = null;
        for (const imageItem of photoItemsCombined) {
          const imageSeconds = appSecondsFromTimeStr(imageItem.dateTaken.split("T")[1]);
          if (imageSeconds > appSeconds) break;

          const diff = Math.abs(appSeconds - imageSeconds);
          if (appSecondsDiff === null || diff <= appSecondsDiff) {
            appSecondsDiff = diff;
            closestImageItem = imageItem;
          }
        }
      }
    }

    if (!closestImageItem) return;

    // Auto-scroll if enabled
    if (isAutoScrollEnabled) {
      const closestImageTimeStr = closestImageItem.dateTaken.split("T")[1];
      const targetElement = document.querySelector(`[data-time="${closestImageTimeStr}"]`);

      if (targetElement) {
        isProgrammaticScrollingRef.current = true;
        targetElement.scrollIntoView({ behavior: "instant" });

        setTimeout(() => {
          isProgrammaticScrollingRef.current = false;
        }, 100);
      }
    }
  }, [
    appSeconds,
    photoItemsCombined,
    isAutoScrollEnabled,
    clickedPhotoFilename,
    lastAppSeconds,
    setClickedPhotoFilename,
    setLastAppSeconds,
  ]);

  const handleThumbnailClick = useCallback(
    (item: PhotoItem) => {
      onThumbnailClick(item);
    },
    [onThumbnailClick]
  );

  return (
    <div className={styles.thumbnailsWrapper}>
      <div
        className={styles.imageThumbsContainer}
        ref={thumbnailsContainerRef}
        onDoubleClick={() => onAutoScrollToggle(!isAutoScrollEnabled)}
      >
        {photoItemsCombined.map((item, index) => (
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
              onClick={() => handleThumbnailClick(item)}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleThumbnailClick(item);
                }
              }}
              onPointerDown={(e) => {
                // Prevent container's pointer handler from triggering for thumbnail clicks
                e.stopPropagation();
              }}
            >
              {visibleImages.has(index) ? (
                <img
                  src={getImageUrl(item, "thumb")}
                  alt={item.ID}
                  loading="lazy"
                  data-tooltip-id="source-button-tooltip"
                  data-tooltip-html={`${item.dateTaken.split("T")[1]} <br/> ${appSeconds - appSecondsFromTimeStr(item.dateTaken.split("T")[1])}s`}
                  data-tooltip-place="top"
                />
              ) : (
                <div className={styles.thumbPlaceholder} />
              )}
            </div>
          </div>
        ))}
      </div>

      {!isAutoScrollEnabled && (
        <button
          className={styles.autoScrollButton}
          onClick={() => onAutoScrollToggle(true)}
          type="button"
          data-tooltip-id="source-button-tooltip"
          data-tooltip-content="Re-enable automatic scrolling"
          data-tooltip-place="left"
        >
          <FontAwesomeIcon icon={faArrowsSpin} />
        </button>
      )}
    </div>
  );
};

export default PhotosThumbs;

import { FunctionComponent, useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsSpin } from "@fortawesome/free-solid-svg-icons";
import styles from "./photosThumbs.module.css";
import { appSecondsFromTimeStr } from "utils/time";
import { useStateClock } from "store/hooks/useStateClock";

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
  // Global state
  const { startStopTimestamp } = useStateClock();

  // Window state for custom lazy loading
  const [windowedPhotos, setWindowedPhotos] = useState<PhotoItem[]>([]);
  const [windowStartIndex, setWindowStartIndex] = useState(0);
  const [windowEndIndex, setWindowEndIndex] = useState(0);

  // Lazy loading state
  const [visibleImages, setVisibleImages] = useState<Set<number>>(new Set());

  const resetWindowState = useCallback(() => {
    setWindowedPhotos([]);
    setWindowStartIndex(0);
    setWindowEndIndex(0);
    setVisibleImages(new Set());
  }, []);

  // Refs
  const observer = useRef<IntersectionObserver | null>(null);
  const thumbnailsContainerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollingRef = useRef(false);
  const isPointerDownRef = useRef(false);
  const userScrollIntentRef = useRef(false);
  const previousStartStopTimestampRef = useRef<string | null>(null);

  // Auto-scroll management
  const disableAutoScroll = useCallback(() => {
    // Don't disable auto-scroll during programmatic scrolling
    if (isProgrammaticScrollingRef.current) return;

    if (isAutoScrollEnabled) {
      onDisableAutoScroll();
    }
  }, [isAutoScrollEnabled, onDisableAutoScroll]);

  // === WINDOW MANAGEMENT ===
  const calculateInitialWindow = useCallback(
    (centerPhoto: PhotoItem | null) => {
      if (!centerPhoto || photoItemsCombined.length === 0) {
        resetWindowState();
        return;
      }

      const centerIndex = photoItemsCombined.findIndex((photo) => photo.ID === centerPhoto.ID);
      if (centerIndex === -1) {
        resetWindowState();
        return;
      }

      const start = Math.max(0, centerIndex - 20);
      const end = Math.min(photoItemsCombined.length, centerIndex + 21);
      const window = photoItemsCombined.slice(start, end);

      setWindowedPhotos(window);
      setWindowStartIndex(start);
      setWindowEndIndex(end - 1);
    },
    [photoItemsCombined, resetWindowState]
  );

  useEffect(() => {
    if (photoItemsCombined.length === 0) {
      resetWindowState();
      return;
    }

    const mostRecentImageInSet = mostRecentImage
      ? photoItemsCombined.find((photo) => photo.ID === mostRecentImage.ID)
      : null;

    const centerPhoto = mostRecentImageInSet ?? photoItemsCombined[0];

    if (centerPhoto) {
      calculateInitialWindow(centerPhoto);
    }
  }, [photoItemsCombined, mostRecentImage, calculateInitialWindow, resetWindowState]);

  const expandWindowStart = useCallback(() => {
    if (windowStartIndex <= 0) return; // Already at beginning of full photo set

    const container = thumbnailsContainerRef.current;
    if (!container) return;

    const newStart = Math.max(0, windowStartIndex - 20);
    const additionalPhotos = photoItemsCombined.slice(newStart, windowStartIndex);
    if (additionalPhotos.length === 0) return;

    // Mark as programmatic to prevent scroll events from disabling auto-scroll
    isProgrammaticScrollingRef.current = true;

    // Save current scroll position before adding photos
    const currentScrollLeft = container.scrollLeft;
    const currentScrollWidth = container.scrollWidth;

    let shouldResetWindow = false;
    let resetAnchor: PhotoItem | null = null;

    setWindowedPhotos((prev) => {
      const newWindowedPhotos = [...additionalPhotos, ...prev];

      // If the number of photos exceeds 200, reset the view around a stable anchor
      if (newWindowedPhotos.length > 200) {
        shouldResetWindow = true;
        resetAnchor =
          mostRecentImage ??
          prev[Math.max(0, Math.floor(prev.length / 2))] ??
          newWindowedPhotos[Math.max(0, Math.floor(newWindowedPhotos.length / 2))] ??
          null;
        return prev;
      }

      return newWindowedPhotos;
    });

    if (shouldResetWindow) {
      if (resetAnchor) {
        requestAnimationFrame(() => {
          calculateInitialWindow(resetAnchor);
          isProgrammaticScrollingRef.current = false;
        });
      } else {
        isProgrammaticScrollingRef.current = false;
      }
      return;
    }

    setWindowStartIndex(newStart);

    // Adjust scroll position after DOM update to maintain visual position
    requestAnimationFrame(() => {
      const newScrollWidth = container.scrollWidth;
      const scrollDiff = newScrollWidth - currentScrollWidth;
      container.scrollLeft = currentScrollLeft + scrollDiff;

      // Reset flag after position adjustment
      requestAnimationFrame(() => {
        isProgrammaticScrollingRef.current = false;
      });
    });
  }, [windowStartIndex, photoItemsCombined, mostRecentImage, calculateInitialWindow]);

  const expandWindowEnd = useCallback(() => {
    if (windowEndIndex >= photoItemsCombined.length - 1) return; // Already at end of full photo set

    const newEnd = Math.min(photoItemsCombined.length, windowEndIndex + 21);
    const additionalPhotos = photoItemsCombined.slice(windowEndIndex + 1, newEnd);
    if (additionalPhotos.length === 0) return;

    // Mark as programmatic to prevent scroll events from disabling auto-scroll
    isProgrammaticScrollingRef.current = true;

    let shouldResetWindow = false;
    let resetAnchor: PhotoItem | null = null;

    setWindowedPhotos((prev) => {
      const newWindowedPhotos = [...prev, ...additionalPhotos];

      // If the number of photos exceeds 200, reset the view around a stable anchor
      if (newWindowedPhotos.length > 200) {
        shouldResetWindow = true;
        resetAnchor =
          mostRecentImage ??
          prev[Math.max(0, Math.floor(prev.length / 2))] ??
          additionalPhotos[Math.max(0, Math.floor(additionalPhotos.length / 2))] ??
          null;
        return prev;
      }

      return newWindowedPhotos;
    });

    if (shouldResetWindow) {
      if (resetAnchor) {
        requestAnimationFrame(() => {
          calculateInitialWindow(resetAnchor);
          isProgrammaticScrollingRef.current = false;
        });
      } else {
        isProgrammaticScrollingRef.current = false;
      }
      return;
    }

    setWindowEndIndex(newEnd - 1);

    // Reset flag after DOM updates
    requestAnimationFrame(() => {
      isProgrammaticScrollingRef.current = false;
    });
  }, [windowEndIndex, photoItemsCombined, mostRecentImage, calculateInitialWindow]);

  // Clock jump detection - Reset window when user manually changes time
  useEffect(() => {
    if (!mostRecentImage) return;

    const currentTimestamp = startStopTimestamp;
    const previousTimestamp = previousStartStopTimestampRef.current;

    // If this is the first time or startStopTimestamp has changed, reset window
    const hasTimestampChanged =
      previousTimestamp === null || currentTimestamp !== previousTimestamp;

    if (hasTimestampChanged) {
      calculateInitialWindow(mostRecentImage);
    }

    // Update the ref for next comparison
    previousStartStopTimestampRef.current = currentTimestamp;
  }, [startStopTimestamp, mostRecentImage, calculateInitialWindow]);

  // === LAZY LOADING ===
  // Intersection Observer for lazy loading images
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
  }, [windowedPhotos]);

  // === SCROLL HANDLING ===
  // Scroll event detection and window expansion
  useEffect(() => {
    const container = thumbnailsContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const isUserInitiatedScroll =
        (isPointerDownRef.current || userScrollIntentRef.current) &&
        !isProgrammaticScrollingRef.current;

      if (isUserInitiatedScroll) {
        disableAutoScroll();
        userScrollIntentRef.current = false;
      }

      // Edge detection for window expansion
      if (windowedPhotos.length === 0) return;

      const scrollLeft = container.scrollLeft;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;

      // Check if scrolled near start (within 3 thumbnails worth of space)
      const nearStart = scrollLeft < 180; // Roughly 3 thumbnails × 60px each
      if (nearStart && windowStartIndex > 0) {
        expandWindowStart();
      }

      // Check if scrolled near end (within 3 thumbnails worth of space)
      const nearEnd = scrollLeft + clientWidth > scrollWidth - 180;
      if (nearEnd && windowEndIndex < photoItemsCombined.length - 1) {
        expandWindowEnd();
      }
    };

    // Other scroll-related event handlers
    const handleWheel = () => {
      userScrollIntentRef.current = true;
      if (isProgrammaticScrollingRef.current) {
        return;
      }
      disableAutoScroll();
      userScrollIntentRef.current = false;
    };
    const handleTouchStart = () => {
      userScrollIntentRef.current = true;
      if (isProgrammaticScrollingRef.current) {
        return;
      }
      disableAutoScroll();
      userScrollIntentRef.current = false;
    };
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
        userScrollIntentRef.current = true;
        if (isProgrammaticScrollingRef.current) {
          return;
        }
        disableAutoScroll();
        userScrollIntentRef.current = false;
      }
    };
    const handlePointerDown = () => {
      isPointerDownRef.current = true;
      userScrollIntentRef.current = true;
    };
    const handlePointerUp = () => {
      isPointerDownRef.current = false;
      userScrollIntentRef.current = false;
    };
    const handlePointerCancel = () => {
      isPointerDownRef.current = false;
      userScrollIntentRef.current = false;
    };

    // Add event listeners
    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("keydown", handleKeyDown);
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointerup", handlePointerUp);
    container.addEventListener("pointercancel", handlePointerCancel);
    container.addEventListener("touchstart", handleTouchStart, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("keydown", handleKeyDown);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("pointercancel", handlePointerCancel);
      container.removeEventListener("touchstart", handleTouchStart);
    };
  }, [
    windowedPhotos,
    disableAutoScroll,
    expandWindowStart,
    expandWindowEnd,
    windowStartIndex,
    windowEndIndex,
    photoItemsCombined.length,
  ]);

  // === AUTO-SCROLL MANAGEMENT ===
  // Auto-scroll to current image based on appSeconds
  useEffect(() => {
    if (!appSeconds || windowedPhotos.length === 0) return;

    // Clear clicked photo state when time changes
    if (lastAppSeconds !== null && lastAppSeconds !== appSeconds && clickedPhotoFilename) {
      setClickedPhotoFilename(null);
    }
    setLastAppSeconds(appSeconds);

    // Find images at current time or closest before in windowed photos
    const imagesAtCurrentTime = windowedPhotos.filter((imageItem) => {
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
      // Check if target time is within the current window range
      if (windowedPhotos.length > 0) {
        const firstPhotoSeconds = appSecondsFromTimeStr(windowedPhotos[0].dateTaken.split("T")[1]);
        const lastPhotoSeconds = appSecondsFromTimeStr(
          windowedPhotos[windowedPhotos.length - 1].dateTaken.split("T")[1]
        );

        if (appSeconds >= firstPhotoSeconds && appSeconds <= lastPhotoSeconds) {
          // Target time is within current window - find closest image
          let appSecondsDiff = null;
          for (const imageItem of windowedPhotos) {
            const imageSeconds = appSecondsFromTimeStr(imageItem.dateTaken.split("T")[1]);
            if (imageSeconds > appSeconds) break;

            const diff = Math.abs(appSeconds - imageSeconds);
            if (appSecondsDiff === null || diff <= appSecondsDiff) {
              appSecondsDiff = diff;
              closestImageItem = imageItem;
            }
          }
        } else {
          // Target time is outside current window - trigger complete window reset
          // Find the photo closest to target time in the full photo set
          if (photoItemsCombined.length === 0) {
            resetWindowState();
            return;
          }

          const targetPhoto = photoItemsCombined.reduce((closest, photo) => {
            const photoSeconds = appSecondsFromTimeStr(photo.dateTaken.split("T")[1]);
            const closestSeconds = appSecondsFromTimeStr(closest.dateTaken.split("T")[1]);

            const photoDiff = Math.abs(appSeconds - photoSeconds);
            const closestDiff = Math.abs(appSeconds - closestSeconds);

            return photoDiff < closestDiff ? photo : closest;
          }, photoItemsCombined[0]);

          // Reset the window around this target photo
          calculateInitialWindow(targetPhoto);

          // Don't set closestImageItem here - let the window reset effect handle scrolling
          return;
        }
      }
    }

    if (!closestImageItem) return;

    // Auto-scroll if enabled
    if (isAutoScrollEnabled) {
      const closestImageTimeStr = closestImageItem.dateTaken.split("T")[1];
      const targetElement = document.querySelector(`[data-time="${closestImageTimeStr}"]`);

      if (targetElement && thumbnailsContainerRef.current) {
        isProgrammaticScrollingRef.current = true;

        // Center the target element in the viewport
        const container = thumbnailsContainerRef.current;
        const targetRect = targetElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Calculate the scroll position to center the element
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const containerCenterX = containerRect.left + containerRect.width / 2;
        const scrollOffset = targetCenterX - containerCenterX;

        container.scrollBy({
          left: scrollOffset,
          behavior: "instant",
        });

        // Use requestAnimationFrame to reset flag after scroll completes
        requestAnimationFrame(() => {
          isProgrammaticScrollingRef.current = false;
        });
      }
    }
  }, [
    appSeconds,
    windowedPhotos,
    isAutoScrollEnabled,
    clickedPhotoFilename,
    lastAppSeconds,
    setClickedPhotoFilename,
    setLastAppSeconds,
    calculateInitialWindow,
    photoItemsCombined,
    resetWindowState,
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
        {windowedPhotos.map((item, index) => (
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

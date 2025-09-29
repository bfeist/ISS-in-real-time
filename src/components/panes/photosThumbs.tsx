import { FunctionComponent, useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsSpin } from "@fortawesome/free-solid-svg-icons";
import styles from "./photosThumbs.module.css";
import { appSecondsFromDateTime, timeComponentFromDateTime } from "utils/time";
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

      setWindowedPhotos((prev) => {
        if (
          prev.length === window.length &&
          prev.every((photo, index) => photo.ID === window[index].ID)
        ) {
          return prev;
        }

        return window;
      });

      setWindowStartIndex((prev) => (prev === start ? prev : start));
      setWindowEndIndex((prev) => (prev === end - 1 ? prev : end - 1));
    },
    [photoItemsCombined, resetWindowState]
  );

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

  useEffect(() => {
    if (photoItemsCombined.length === 0) {
      resetWindowState();
      return;
    }

    const hasMostRecentInSet = mostRecentImage
      ? photoItemsCombined.some((photo) => photo.ID === mostRecentImage.ID)
      : false;

    const targetPhoto = hasMostRecentInSet ? mostRecentImage : photoItemsCombined[0];

    if (!targetPhoto) {
      resetWindowState();
      return;
    }

    const targetIndex = photoItemsCombined.findIndex((photo) => photo.ID === targetPhoto.ID);

    const windowIsEmpty = windowedPhotos.length === 0;

    if (windowIsEmpty || targetIndex === -1) {
      calculateInitialWindow(targetPhoto);
      return;
    }

    const outsideWindow = targetIndex < windowStartIndex || targetIndex > windowEndIndex;

    if (outsideWindow) {
      calculateInitialWindow(targetPhoto);
      return;
    }

    const BUFFER_THRESHOLD = 5;
    const nearStart = targetIndex - windowStartIndex < BUFFER_THRESHOLD && windowStartIndex > 0;
    const nearEnd =
      windowEndIndex - targetIndex < BUFFER_THRESHOLD &&
      windowEndIndex < photoItemsCombined.length - 1;

    if (nearStart) {
      expandWindowStart();
    } else if (nearEnd) {
      expandWindowEnd();
    }
  }, [
    photoItemsCombined,
    mostRecentImage,
    windowedPhotos.length,
    windowStartIndex,
    windowEndIndex,
    calculateInitialWindow,
    resetWindowState,
    expandWindowStart,
    expandWindowEnd,
  ]);

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

    if (lastAppSeconds !== null && lastAppSeconds !== appSeconds && clickedPhotoFilename) {
      setClickedPhotoFilename(null);
    }
    setLastAppSeconds(appSeconds);

    const windowedEntries = windowedPhotos
      .map((photo) => {
        const seconds = appSecondsFromDateTime(photo.dateTaken);
        if (seconds === null) {
          return null;
        }

        return { photo, seconds };
      })
      .filter((entry): entry is { photo: PhotoItem; seconds: number } => entry !== null);

    const combinedEntries = photoItemsCombined
      .map((photo) => {
        const seconds = appSecondsFromDateTime(photo.dateTaken);
        if (seconds === null) {
          return null;
        }

        return { photo, seconds };
      })
      .filter((entry): entry is { photo: PhotoItem; seconds: number } => entry !== null);

    const fallbackPhoto =
      windowedPhotos.find((photo) => photo.ID === clickedPhotoFilename) ??
      windowedPhotos[0] ??
      null;

    if (windowedEntries.length === 0) {
      if (combinedEntries.length === 0) {
        return;
      }

      const targetEntry = combinedEntries.reduce((closest, entry) => {
        const diff = Math.abs(appSeconds - entry.seconds);
        const closestDiff = Math.abs(appSeconds - closest.seconds);
        return diff < closestDiff ? entry : closest;
      }, combinedEntries[0]);

      calculateInitialWindow(targetEntry.photo);
      return;
    }

    const imagesAtCurrentTime = windowedEntries
      .filter(({ seconds }) => seconds === appSeconds)
      .map(({ photo }) => photo);

    let closestImageItem: PhotoItem | null = null;

    if (imagesAtCurrentTime.length > 0) {
      if (clickedPhotoFilename) {
        closestImageItem =
          imagesAtCurrentTime.find((img) => img.ID === clickedPhotoFilename) ||
          imagesAtCurrentTime[0];
      } else {
        closestImageItem = imagesAtCurrentTime[0];
      }
    } else {
      const firstPhotoSeconds = windowedEntries[0].seconds;
      const lastPhotoSeconds = windowedEntries[windowedEntries.length - 1].seconds;

      if (appSeconds >= firstPhotoSeconds && appSeconds <= lastPhotoSeconds) {
        let appSecondsDiff: number | null = null;

        for (const { photo, seconds } of windowedEntries) {
          if (seconds > appSeconds) break;

          const diff = Math.abs(appSeconds - seconds);
          if (appSecondsDiff === null || diff <= appSecondsDiff) {
            appSecondsDiff = diff;
            closestImageItem = photo;
          }
        }

        if (!closestImageItem && fallbackPhoto) {
          closestImageItem = fallbackPhoto;
        }
      } else {
        if (combinedEntries.length === 0) {
          resetWindowState();
          return;
        }

        const targetEntry = combinedEntries.reduce((closest, entry) => {
          const diff = Math.abs(appSeconds - entry.seconds);
          const closestDiff = Math.abs(appSeconds - closest.seconds);
          return diff < closestDiff ? entry : closest;
        }, combinedEntries[0]);

        calculateInitialWindow(targetEntry.photo);
        return;
      }
    }

    if (!closestImageItem) return;

    if (isAutoScrollEnabled) {
      const container = thumbnailsContainerRef.current;
      if (!container) {
        return;
      }

      const targetElement = Array.from(
        container.querySelectorAll<HTMLElement>("[data-photo-id]")
      ).find((el) => el.dataset.photoId === closestImageItem.ID);

      if (!targetElement) {
        return;
      }

      isProgrammaticScrollingRef.current = true;

      const targetRect = targetElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const targetCenterX = targetRect.left + targetRect.width / 2;
      const containerCenterX = containerRect.left + containerRect.width / 2;
      const scrollOffset = targetCenterX - containerCenterX;

      container.scrollBy({
        left: scrollOffset,
        behavior: "instant",
      });

      requestAnimationFrame(() => {
        isProgrammaticScrollingRef.current = false;
      });
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
        {windowedPhotos.map((item, index) => {
          const timeLabel = timeComponentFromDateTime(item.dateTaken);
          const imageSeconds = appSecondsFromDateTime(item.dateTaken);
          const tooltipHtml =
            timeLabel && imageSeconds !== null
              ? `${timeLabel} <br/> ${appSeconds - imageSeconds}s`
              : "Time unavailable";
          const dataTimeValue = timeLabel ?? `unknown-${item.ID}`;

          return (
            <div
              key={index}
              className={`${styles.imageThumb} ${mostRecentImage?.ID === item.ID ? styles.active : ""} lazy-load`}
              data-index={index}
              data-photo-id={item.ID}
              data-time={dataTimeValue}
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
                    data-tooltip-html={tooltipHtml}
                    data-tooltip-place="top"
                  />
                ) : (
                  <div className={styles.thumbPlaceholder} />
                )}
              </div>
            </div>
          );
        })}
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

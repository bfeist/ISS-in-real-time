import { FunctionComponent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsSpin } from "@fortawesome/free-solid-svg-icons";
import styles from "./photosThumbs.module.css";
import { appSecondsFromDateTime, timeComponentFromDateTime } from "utils/time";
import { useStateClock } from "store/hooks/useStateClock";
import { isIosSafari } from "utils/device";

interface PhotosThumbsProps {
  photoItemsCombined: PhotoItem[];
  appSeconds: number;
  mostRecentImage: PhotoItem | null;
  clickedPhotoFilename: string | null;
  lastAppSeconds: number | null;
  isAutoScrollEnabled: boolean;
  getImageUrl: (photoItem: PhotoItem, size: "small" | "medium" | "large") => string;
  onThumbnailClick: (item: PhotoItem) => void;
  onAutoScrollToggle: (enabled: boolean) => void;
  onDisableAutoScroll: () => void;
  setClickedPhotoFilename: (filename: string | null) => void;
  setLastAppSeconds: (seconds: number | null) => void;
}

const SCROLL_EPSILON = 0.5;

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

  const isIosSafariDevice = useMemo(() => isIosSafari(), []);

  const programmaticScrollTo = useCallback(
    (container: HTMLDivElement | null, targetScrollLeft: number) => {
      if (!container) {
        return false;
      }

      const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      const clampedTarget = Math.min(Math.max(targetScrollLeft, 0), maxScrollLeft);
      const diff = clampedTarget - container.scrollLeft;

      if (Math.abs(diff) <= SCROLL_EPSILON) {
        return false;
      }

      isProgrammaticScrollingRef.current = true;

      const finalize = () => {
        requestAnimationFrame(() => {
          isProgrammaticScrollingRef.current = false;
        });
      };

      if (isIosSafariDevice) {
        const previousOverflowX = container.style.overflowX;
        const previousOverflowY = container.style.overflowY;
        const previousWebkitOverflow = container.style.getPropertyValue(
          "-webkit-overflow-scrolling"
        );

        container.style.overflowX = "hidden";
        container.style.overflowY = "hidden";
        container.style.setProperty("-webkit-overflow-scrolling", "auto");
        container.scrollLeft = clampedTarget;

        requestAnimationFrame(() => {
          container.style.overflowX = previousOverflowX || "";
          container.style.overflowY = previousOverflowY || "";

          if (previousWebkitOverflow) {
            container.style.setProperty("-webkit-overflow-scrolling", previousWebkitOverflow);
          } else {
            container.style.removeProperty("-webkit-overflow-scrolling");
          }

          container.scrollLeft = clampedTarget;
          finalize();
        });
      } else {
        container.scrollTo({ left: clampedTarget, behavior: "auto" });
        finalize();
      }

      return true;
    },
    [isIosSafariDevice]
  );

  // Window management function refs to avoid circular dependencies
  const calculateInitialWindowRef = useRef<(centerPhoto: PhotoItem | null) => void>();
  const expandWindowStartRef = useRef<() => void>();
  const expandWindowEndRef = useRef<() => void>();

  // Auto-scroll management
  const disableAutoScroll = useCallback(() => {
    // Don't disable auto-scroll during programmatic scrolling
    if (isProgrammaticScrollingRef.current) return;

    if (isAutoScrollEnabled) {
      onDisableAutoScroll();
    }
  }, [isAutoScrollEnabled, onDisableAutoScroll]);

  // === WINDOW MANAGEMENT ===
  // Initialize window management functions in useEffect to break circular dependencies
  useEffect(() => {
    calculateInitialWindowRef.current = (centerPhoto: PhotoItem | null) => {
      if (!centerPhoto || photoItemsCombined.length === 0) {
        resetWindowState();
        return;
      }

      const centerIndex = photoItemsCombined.findIndex(
        (photo) => photo.nasaId === centerPhoto.nasaId
      );
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
          prev.every((photo, index) => photo.nasaId === window[index].nasaId)
        ) {
          return prev;
        }

        return window;
      });

      setWindowStartIndex((prev) => (prev === start ? prev : start));
      setWindowEndIndex((prev) => (prev === end - 1 ? prev : end - 1));
    };

    expandWindowStartRef.current = () => {
      if (windowStartIndex <= 0) return;

      const container = thumbnailsContainerRef.current;
      if (!container) return;

      const newStart = Math.max(0, windowStartIndex - 20);
      const additionalPhotos = photoItemsCombined.slice(newStart, windowStartIndex);
      if (additionalPhotos.length === 0) return;

      isProgrammaticScrollingRef.current = true;

      const currentScrollLeft = container.scrollLeft;
      const currentScrollWidth = container.scrollWidth;

      let shouldResetWindow = false;
      let resetAnchor: PhotoItem | null = null;

      setWindowedPhotos((prev) => {
        const newWindowedPhotos = [...additionalPhotos, ...prev];

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
            calculateInitialWindowRef.current?.(resetAnchor);
            isProgrammaticScrollingRef.current = false;
          });
        } else {
          isProgrammaticScrollingRef.current = false;
        }
        return;
      }

      setWindowStartIndex(newStart);

      requestAnimationFrame(() => {
        const newScrollWidth = container.scrollWidth;
        const scrollDiff = newScrollWidth - currentScrollWidth;
        container.scrollLeft = currentScrollLeft + scrollDiff;

        requestAnimationFrame(() => {
          isProgrammaticScrollingRef.current = false;
        });
      });
    };

    expandWindowEndRef.current = () => {
      if (windowEndIndex >= photoItemsCombined.length - 1) return;

      const newEnd = Math.min(photoItemsCombined.length, windowEndIndex + 21);
      const additionalPhotos = photoItemsCombined.slice(windowEndIndex + 1, newEnd);
      if (additionalPhotos.length === 0) return;

      isProgrammaticScrollingRef.current = true;

      let shouldResetWindow = false;
      let resetAnchor: PhotoItem | null = null;

      setWindowedPhotos((prev) => {
        const newWindowedPhotos = [...prev, ...additionalPhotos];

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
            calculateInitialWindowRef.current?.(resetAnchor);
            isProgrammaticScrollingRef.current = false;
          });
        } else {
          isProgrammaticScrollingRef.current = false;
        }
        return;
      }

      setWindowEndIndex(newEnd - 1);

      requestAnimationFrame(() => {
        isProgrammaticScrollingRef.current = false;
      });
    };
  }, [photoItemsCombined, mostRecentImage, windowStartIndex, windowEndIndex, resetWindowState]);

  useEffect(() => {
    if (photoItemsCombined.length === 0) {
      resetWindowState();
      return;
    }

    // Check if current windowedPhotos are still valid (all photos exist in current photoItemsCombined)
    const windowIsValid = windowedPhotos.every((photo) =>
      photoItemsCombined.some((p) => p.nasaId === photo.nasaId)
    );

    if (!windowIsValid) {
      resetWindowState();
    }

    const hasMostRecentInSet = mostRecentImage
      ? photoItemsCombined.some((photo) => photo.nasaId === mostRecentImage.nasaId)
      : false;

    const targetPhoto = hasMostRecentInSet ? mostRecentImage : photoItemsCombined[0];

    if (!targetPhoto) {
      resetWindowState();
      return;
    }

    const targetIndex = photoItemsCombined.findIndex(
      (photo) => photo.nasaId === targetPhoto.nasaId
    );

    const windowIsEmpty = windowedPhotos.length === 0;

    if (windowIsEmpty || targetIndex === -1) {
      calculateInitialWindowRef.current?.(targetPhoto);
      return;
    }

    const outsideWindow = targetIndex < windowStartIndex || targetIndex > windowEndIndex;

    if (outsideWindow) {
      calculateInitialWindowRef.current?.(targetPhoto);
      return;
    }

    const BUFFER_THRESHOLD = 5;
    const nearStart = targetIndex - windowStartIndex < BUFFER_THRESHOLD && windowStartIndex > 0;
    const nearEnd =
      windowEndIndex - targetIndex < BUFFER_THRESHOLD &&
      windowEndIndex < photoItemsCombined.length - 1;

    if (nearStart) {
      expandWindowStartRef.current?.();
    } else if (nearEnd) {
      expandWindowEndRef.current?.();
    }
  }, [
    photoItemsCombined,
    mostRecentImage,
    windowedPhotos,
    windowStartIndex,
    windowEndIndex,
    resetWindowState,
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
      calculateInitialWindowRef.current?.(mostRecentImage);
    }

    // Update the ref for next comparison
    previousStartStopTimestampRef.current = currentTimestamp;
  }, [startStopTimestamp, mostRecentImage]);

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
        expandWindowStartRef.current?.();
      }

      // Check if scrolled near end (within 3 thumbnails worth of space)
      const nearEnd = scrollLeft + clientWidth > scrollWidth - 180;
      if (nearEnd && windowEndIndex < photoItemsCombined.length - 1) {
        expandWindowEndRef.current?.();
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
      windowedPhotos.find((photo) => photo.nasaId === clickedPhotoFilename) ??
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

      calculateInitialWindowRef.current?.(targetEntry.photo);
      return;
    }

    const imagesAtCurrentTime = windowedEntries
      .filter(({ seconds }) => seconds === appSeconds)
      .map(({ photo }) => photo);

    let closestImageItem: PhotoItem | null = null;

    if (imagesAtCurrentTime.length > 0) {
      if (clickedPhotoFilename) {
        closestImageItem =
          imagesAtCurrentTime.find((img) => img.nasaId === clickedPhotoFilename) ||
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

        calculateInitialWindowRef.current?.(targetEntry.photo);
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
      ).find((el) => el.dataset.photoId === closestImageItem.nasaId);

      if (!targetElement) {
        return;
      }

      isProgrammaticScrollingRef.current = true;

      const targetCenterOffset = targetElement.offsetLeft + targetElement.offsetWidth / 2;
      const desiredScrollLeft = targetCenterOffset - container.clientWidth / 2;

      programmaticScrollTo(container, desiredScrollLeft);
    }
  }, [
    appSeconds,
    windowedPhotos,
    isAutoScrollEnabled,
    clickedPhotoFilename,
    lastAppSeconds,
    setClickedPhotoFilename,
    setLastAppSeconds,
    photoItemsCombined,
    resetWindowState,
    programmaticScrollTo,
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
          const dataTimeValue = timeLabel ?? `unknown-${item.nasaId}`;

          return (
            <div
              key={index}
              className={`${styles.imageThumb} ${mostRecentImage?.nasaId === item.nasaId ? styles.active : ""} lazy-load`}
              data-index={index}
              data-photo-id={item.nasaId}
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
                    src={getImageUrl(item, "small")}
                    alt={item.nasaId}
                    loading="lazy"
                    data-tooltip-id="issirt-tooltip"
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
          data-tooltip-id="issirt-tooltip"
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

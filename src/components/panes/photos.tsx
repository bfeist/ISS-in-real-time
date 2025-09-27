import { FunctionComponent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsSpin, faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import styles from "./photos.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateToggle } from "store/hooks/useStateToggle";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";
import PhotoToggle from "./photoToggle";
import { useDateEarthPhotography, useDatePhotosFlickr } from "api/useDateSpecificData";
import SourceButton from "../common/sourceButton";

const Photos: FunctionComponent<{ height?: "tall" | "short" }> = ({ height = "short" }) => {
  const { selectedDate, setClock } = useStateClock();
  const { showEarthPhotos, showMissionPhotos, setShowEarthPhotos, setShowMissionPhotos } =
    useStateToggle();
  const { data: earthPhotographyItems = [], isLoading: earthPhotographyIsLoading } =
    useDateEarthPhotography(selectedDate || "");
  const { data: flickrPhotosItems = [], isLoading: flickrPhotosIsLoading } = useDatePhotosFlickr(
    selectedDate || ""
  );

  // State
  const [visibleImages, setVisibleImages] = useState<Set<number>>(new Set());
  const [appSeconds, setAppSeconds] = useState(0);
  const [mostRecentImage, setMostRecentImage] = useState(null);
  const [isHoveringContainer, setIsHoveringContainer] = useState(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [clickedPhotoFilename, setClickedPhotoFilename] = useState<string | null>(null);
  const [lastAppSeconds, setLastAppSeconds] = useState<number | null>(null);

  // Refs (only for values that don't trigger re-renders)
  const observer = useRef<IntersectionObserver | null>(null);
  const thumbnailsContainerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollingRef = useRef(false);
  const isPointerDownRef = useRef(false);

  // Computed values
  const isLoading = earthPhotographyIsLoading || flickrPhotosIsLoading;
  const hasEarthPhotos = earthPhotographyItems.length > 0;
  const hasMissionPhotos = flickrPhotosItems.length > 0;

  // Combined and sorted photos
  const photoItemsCombined = useMemo(() => {
    const earthPhotos = showEarthPhotos ? earthPhotographyItems : [];
    const missionPhotos = showMissionPhotos ? flickrPhotosItems : [];

    return [...earthPhotos, ...missionPhotos].sort(
      (a, b) => new Date(a.dateTaken).getTime() - new Date(b.dateTaken).getTime()
    );
  }, [earthPhotographyItems, flickrPhotosItems, showEarthPhotos, showMissionPhotos]);

  // URL generation
  const issirtDataBaseUrl = import.meta.env.VITE_IMAGE_BASE_URL.replace("\\x3a", ":");
  const flickrBaseUrl = "https://live.staticflickr.com";

  const getImageUrl = useCallback(
    (photoItem: PhotoItem, size: "thumb" | "medium" | "large") => {
      const { type } = photoItem;

      switch (type) {
        case "photos_earth":
          if (size === "thumb" || size === "medium") {
            return `${issirtDataBaseUrl}/${photoItem.smallUrl}`;
          }
          return `${issirtDataBaseUrl}/${photoItem.largeUrl}`;

        case "photos_flickr":
          if (size === "thumb") {
            return `${flickrBaseUrl}/${photoItem.smallUrl || ""}`;
          } else if (size === "medium") {
            return `${flickrBaseUrl}/${photoItem.medUrl || photoItem.smallUrl || ""}`;
          }
          return `${flickrBaseUrl}/${photoItem.largeUrl || photoItem.medUrl || photoItem.smallUrl || ""}`;

        default:
          return "";
      }
    },
    [issirtDataBaseUrl, flickrBaseUrl]
  );

  // Auto-scroll management
  const disableAutoScroll = useCallback(() => {
    if (isAutoScrollEnabled && !isProgrammaticScrollingRef.current) {
      setIsAutoScrollEnabled(false);
    }
  }, [isAutoScrollEnabled]);

  // Smart toggle preservation: ensure at least one photo type is enabled if available
  useEffect(() => {
    if (isLoading || !selectedDate) return;

    const wouldShowEarthPhotos = showEarthPhotos && hasEarthPhotos;
    const wouldShowMissionPhotos = showMissionPhotos && hasMissionPhotos;
    const wouldShowAnyPhotos = wouldShowEarthPhotos || wouldShowMissionPhotos;

    if (!wouldShowAnyPhotos && (hasEarthPhotos || hasMissionPhotos)) {
      if (hasEarthPhotos && !showEarthPhotos) {
        setShowEarthPhotos(true);
      } else if (hasMissionPhotos && !showMissionPhotos) {
        setShowMissionPhotos(true);
      }
    }
  }, [
    selectedDate,
    isLoading,
    hasEarthPhotos,
    hasMissionPhotos,
    showEarthPhotos,
    showMissionPhotos,
    setShowEarthPhotos,
    setShowMissionPhotos,
  ]);

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
      if (isPointerDownRef.current && !isProgrammaticScrollingRef.current) {
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

    // Update most recent image
    if (closestImageItem.ID !== mostRecentImage?.ID) {
      setMostRecentImage(closestImageItem);
    }
  }, [
    appSeconds,
    photoItemsCombined,
    mostRecentImage,
    isAutoScrollEnabled,
    clickedPhotoFilename,
    lastAppSeconds,
  ]);

  const handleThumbnailClick = useCallback(
    (item: PhotoItem) => {
      const targetTime = appSecondsFromTimeStr(item.dateTaken.split("T")[1]);
      setClock(targetTime);
      setClickedPhotoFilename(item.ID);
    },
    [setClock]
  );

  if (isLoading) {
    return <div>Loading Photos...</div>;
  }

  return (
    <div
      className={styles.imageComponentContainer}
      onMouseEnter={() => setIsHoveringContainer(true)}
      onMouseLeave={() => setIsHoveringContainer(false)}
    >
      {hasEarthPhotos && hasMissionPhotos && <PhotoToggle isVisible={isHoveringContainer} />}
      <ClockInterval setAppSeconds={setAppSeconds} />

      <div
        className={styles.currentImage}
        style={height === "short" ? { maxHeight: "35vh" } : undefined}
        role="button"
        tabIndex={0}
        onClick={() =>
          mostRecentImage && window.open(getImageUrl(mostRecentImage, "large"), "_blank")
        }
        onKeyUp={(e) => {
          if ((e.key === "Enter" || e.key === " ") && mostRecentImage) {
            window.open(getImageUrl(mostRecentImage, "large"), "_blank");
          }
        }}
      >
        {mostRecentImage && (
          <img src={getImageUrl(mostRecentImage, "medium")} alt={mostRecentImage.ID} />
        )}
        {mostRecentImage && mostRecentImage.description && (
          <div className={styles.descriptionOverlay}>
            <div className={styles.descriptionContent}>
              {mostRecentImage.sourceUrl && (
                <SourceButton
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(mostRecentImage.sourceUrl, "_blank");
                  }}
                  variant="iconOnly"
                >
                  <FontAwesomeIcon icon={faExternalLinkAlt} />
                </SourceButton>
              )}
              <p>{mostRecentImage.description}</p>
            </div>
          </div>
        )}
      </div>

      <div
        className={styles.imageThumbsContainer}
        ref={thumbnailsContainerRef}
        onDoubleClick={() => setIsAutoScrollEnabled(!isAutoScrollEnabled)}
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
          onClick={() => setIsAutoScrollEnabled(true)}
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

export default Photos;

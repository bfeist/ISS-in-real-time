import { FunctionComponent, useEffect, useMemo, useRef, useState } from "react";
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

  const isLoading = earthPhotographyIsLoading || flickrPhotosIsLoading;

  const hasEarthPhotos = earthPhotographyItems.length > 0;
  const hasMissionPhotos = flickrPhotosItems.length > 0;

  // Smart toggle preservation: ensure at least one photo type is enabled if available
  useEffect(() => {
    // Skip if data is still loading or no date selected
    if (isLoading || !selectedDate) return;

    // Check if current toggle state would result in no photos being shown
    const wouldShowEarthPhotos = showEarthPhotos && hasEarthPhotos;
    const wouldShowMissionPhotos = showMissionPhotos && hasMissionPhotos;
    const wouldShowAnyPhotos = wouldShowEarthPhotos || wouldShowMissionPhotos;

    // If no photos would be shown but we have photos available, enable at least one type
    if (!wouldShowAnyPhotos && (hasEarthPhotos || hasMissionPhotos)) {
      // Priority: enable earth photos if available, otherwise mission photos
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

  const photoItemsCombined = useMemo(() => {
    const earthPhotos = showEarthPhotos ? earthPhotographyItems : [];
    const missionPhotos = showMissionPhotos ? flickrPhotosItems : [];

    return [...earthPhotos, ...missionPhotos].sort(
      (a, b) => new Date(a.dateTaken).getTime() - new Date(b.dateTaken).getTime()
    );
  }, [earthPhotographyItems, flickrPhotosItems, showEarthPhotos, showMissionPhotos]);

  const issirtDataBaseUrl = import.meta.env.VITE_IMAGE_BASE_URL.replace("\\x3a", ":");
  const flickrBaseUrl = "https://live.staticflickr.com";

  // Function to generate image URL based on type and size
  const getImageUrl = (photoItem: PhotoItem, size: "thumb" | "medium" | "large") => {
    const { type } = photoItem;

    switch (type) {
      case "photos_earth":
        // Use existing smallUrl and largeUrl
        if (size === "thumb") {
          return `${issirtDataBaseUrl}/${photoItem.smallUrl}`;
        } else if (size === "medium") {
          return `${issirtDataBaseUrl}/${photoItem.smallUrl}`; // photos_earth doesn't have medium, use small
        } else if (size === "large") {
          return `${issirtDataBaseUrl}/${photoItem.largeUrl}`;
        }
        break;

      case "photos_flickr":
        // Flickr photos have smallUrl, medUrl, and largeUrl - these are direct Flickr URLs
        if (size === "thumb") {
          return `${flickrBaseUrl}/${photoItem.smallUrl || ""}`;
        } else if (size === "medium") {
          return `${flickrBaseUrl}/${photoItem.medUrl || photoItem.smallUrl || ""}`;
        } else if (size === "large") {
          return `${flickrBaseUrl}/${photoItem.largeUrl || photoItem.medUrl || photoItem.smallUrl || ""}`;
        }
        break;
    }
  };

  const [visibleImages, setVisibleImages] = useState<Set<number>>(new Set());
  const [appSeconds, setAppSeconds] = useState(0);
  const [mostRecentImage, setMostRecentImage] = useState(null);
  const [isHoveringContainer, setIsHoveringContainer] = useState(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [clickedPhotoFilename, setClickedPhotoFilename] = useState<string | null>(null);

  const observer = useRef<IntersectionObserver | null>(null);
  const thumbnailsContainerRef = useRef<HTMLDivElement>(null);
  const lastAppSecondsRef = useRef<number | null>(null);
  const isProgrammaticScrollingRef = useRef(false);
  const isPointerDownRef = useRef(false);
  const lastSelectedDateRef = useRef<string | null>(null);

  // Smart toggle preservation: ensure at least one photo type is enabled if available
  // Only runs when the date changes, not when toggles change
  useEffect(() => {
    // Skip if data is still loading or no date selected
    if (isLoading || !selectedDate) return;

    // Only run when the date actually changes
    if (lastSelectedDateRef.current === selectedDate) return;

    // Update the last selected date
    lastSelectedDateRef.current = selectedDate;

    // If both photo types are available, we don't need to do anything
    if (hasEarthPhotos && hasMissionPhotos) return;

    // Check if current toggle state would result in no photos being shown
    const wouldShowEarthPhotos = showEarthPhotos && hasEarthPhotos;
    const wouldShowMissionPhotos = showMissionPhotos && hasMissionPhotos;
    const wouldShowAnyPhotos = wouldShowEarthPhotos || wouldShowMissionPhotos;

    // If no photos would be shown but we have photos available, enable at least one type
    if (!wouldShowAnyPhotos && (hasEarthPhotos || hasMissionPhotos)) {
      // Priority: enable earth photos if available, otherwise mission photos
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
  }, [photoItemsCombined]);

  // Enhanced scroll event detection with multiple interaction methods and debouncing
  useEffect(() => {
    const container = thumbnailsContainerRef.current;
    if (!container) return;

    // Capture timeout refs at the beginning of the effect
    let debounceTimeout: NodeJS.Timeout | null = null;

    const handleManualScroll = () => {
      // Clear any existing debounce
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      // Debounce the auto-scroll disable to prevent rapid toggling
      debounceTimeout = setTimeout(() => {
        if (isAutoScrollEnabled && !isProgrammaticScrollingRef.current) {
          setIsAutoScrollEnabled(false);
        }
      }, 50); // 50ms debounce
    };

    const handleScroll = () => {
      // Check multiple conditions for manual scroll detection
      if (
        isPointerDownRef.current ||
        container.matches(":active") ||
        document.activeElement === container
      ) {
        handleManualScroll();
      }
    };

    const handleWheel = () => {
      handleManualScroll();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) {
        handleManualScroll();
      }
    };

    const handlePointerDown = () => {
      isPointerDownRef.current = true;
      handleManualScroll();
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
    };

    const handleTouchStart = () => {
      // Touch scrolling should also disable auto-scroll
      handleManualScroll();
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

      // Clean up local timeout
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [isAutoScrollEnabled]);

  useEffect(() => {
    if (!appSeconds) return;

    // Clear clicked photo state when time changes (unless it's the first run)
    if (
      lastAppSecondsRef.current !== null &&
      lastAppSecondsRef.current !== appSeconds &&
      clickedPhotoFilename
    ) {
      setClickedPhotoFilename(null);
    }

    // Update the last app seconds tracker
    lastAppSecondsRef.current = appSeconds;

    // Find all images at the current time
    const imagesAtCurrentTime = photoItemsCombined.filter((imageItem) => {
      const imageSeconds = appSecondsFromTimeStr(imageItem.dateTaken.split("T")[1]);
      return imageSeconds === appSeconds;
    });

    let closestImageItem = null;

    if (imagesAtCurrentTime.length > 0) {
      // If there are images at the exact current time, prioritize the clicked one
      if (clickedPhotoFilename) {
        const clickedImage = imagesAtCurrentTime.find((img) => img.ID === clickedPhotoFilename);
        if (clickedImage) {
          closestImageItem = clickedImage;
        } else {
          closestImageItem = imagesAtCurrentTime[0];
        }
      } else {
        closestImageItem = imagesAtCurrentTime[0];
      }
    } else {
      // No images at exact current time, find the closest image before current time
      closestImageItem = photoItemsCombined[0] || null;
      if (closestImageItem) {
        let appSecondsDiff = null;
        for (const imageItem of photoItemsCombined) {
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
      }
    }

    if (!closestImageItem) return;

    // Only auto-scroll if enabled
    if (isAutoScrollEnabled) {
      const closestImageTimeStr = closestImageItem.dateTaken.split("T")[1];
      const targetElement = document.querySelector(`[data-time="${closestImageTimeStr}"]`);

      if (targetElement) {
        // Set flag to indicate this is programmatic scrolling
        isProgrammaticScrollingRef.current = true;
        targetElement.scrollIntoView({ behavior: "instant" });

        // Clear the flag after a short delay to allow for the scroll event to fire
        // Use requestAnimationFrame to ensure the scroll has completed
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            isProgrammaticScrollingRef.current = false;
          });
        });
      }
    }

    if (closestImageItem.ID !== mostRecentImage?.ID) {
      setMostRecentImage(closestImageItem);
    }
  }, [appSeconds, photoItemsCombined, mostRecentImage, isAutoScrollEnabled, clickedPhotoFilename]);

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
        onClick={() => window.open(getImageUrl(mostRecentImage, "large"), "_blank")}
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") {
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
        onDoubleClick={() => {
          setIsAutoScrollEnabled(!isAutoScrollEnabled);
        }}
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
              onClick={() => {
                const targetTime = appSecondsFromTimeStr(item.dateTaken.split("T")[1]);
                setClock(targetTime);
                setClickedPhotoFilename(item.ID);
              }}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  const targetTime = appSecondsFromTimeStr(item.dateTaken.split("T")[1]);
                  setClock(targetTime);
                  setClickedPhotoFilename(item.ID);
                }
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
          onClick={() => {
            setIsAutoScrollEnabled(true);
          }}
          type="button"
          data-tooltip-id="source-button-tooltip"
          data-tooltip-content={"Re-enable automatic scrolling"}
          data-tooltip-place="left"
        >
          <FontAwesomeIcon icon={faArrowsSpin} />
        </button>
      )}
    </div>
  );
};

export default Photos;

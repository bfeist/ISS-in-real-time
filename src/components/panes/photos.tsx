import { FunctionComponent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./photos.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";
import { useDateEarthPhotography } from "api/useDateSpecificData";
import { useGeneralImagesNasaGov, useGeneralPhotosManual } from "../../api/useGeneralData";

const Photos: FunctionComponent<{ height?: "tall" | "short" }> = ({ height = "short" }) => {
  const { selectedDate, setClock } = useStateClock();
  const { data: earthPhotographyItems = [], isLoading: earthPhotographyIsLoading } =
    useDateEarthPhotography(selectedDate || "");
  const { data: imagesNasaGovItems = [], isLoading: imagesNasaGovIsLoading } =
    useGeneralImagesNasaGov();

  const { data: photosManualItems = [], isLoading: photosManualIsLoading } =
    useGeneralPhotosManual();

  const filteredImagesNasaGovItems = useMemo(
    () =>
      selectedDate
        ? imagesNasaGovItems.filter((item) => item.dateTaken.startsWith(selectedDate))
        : [],
    [imagesNasaGovItems, selectedDate]
  );

  const filteredPhotosManualItems = useMemo(
    () =>
      selectedDate
        ? photosManualItems.filter((item) => item.dateTaken.startsWith(selectedDate))
        : [],
    [photosManualItems, selectedDate]
  );

  const isLoading = earthPhotographyIsLoading || imagesNasaGovIsLoading || photosManualIsLoading;

  const photoItemsCombined = useMemo(
    () =>
      [...filteredImagesNasaGovItems, ...filteredPhotosManualItems, ...earthPhotographyItems].sort(
        (a, b) => new Date(a.dateTaken).getTime() - new Date(b.dateTaken).getTime()
      ),
    [filteredImagesNasaGovItems, filteredPhotosManualItems, earthPhotographyItems]
  );

  const imageBaseUrl = import.meta.env.VITE_IMAGE_BASE_URL.replace("\\x3a", ":");

  // Function to generate image URL based on type and size
  const getImageUrl = (photoItem: PhotoItem, size: "thumb" | "medium" | "large") => {
    const { ID, type } = photoItem;

    switch (type) {
      case "earth_photography":
        // Use existing smallUrl and largeUrl
        if (size === "thumb") {
          return `${imageBaseUrl}/${photoItem.smallUrl}`;
        } else if (size === "medium") {
          return `${imageBaseUrl}/${photoItem.smallUrl}`; // earth_photography doesn't have medium, use small
        } else if (size === "large") {
          return `${imageBaseUrl}/${photoItem.largeUrl}`;
        }
        break;

      case "images_nasa_gov":
        // Format: https://images-assets.nasa.gov/image/<ID>/<ID>~<size>.jpg
        const nasaSize = size === "thumb" ? "small" : size === "medium" ? "med" : "large";
        return `https://images-assets.nasa.gov/image/${ID}/${ID}~${nasaSize}.jpg`;

      case "manual":
        // Format: data.issinrealtime.org/photos_manual/<size>/<ID>.jpg
        const manualSize = size === "thumb" ? "thumb" : size === "medium" ? "med" : "orig";
        return `https://data.issinrealtime.org/ISSiRT_assets/photos_manual/${manualSize}/${ID}.jpg`;

      default:
        // Fallback to earth_photography format
        if (size === "thumb") {
          return `${imageBaseUrl}/${photoItem.smallUrl}`;
        } else {
          return `${imageBaseUrl}/${photoItem.largeUrl}`;
        }
    }
  };

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
  }, [photoItemsCombined]);

  useEffect(() => {
    if (!appSeconds) return;

    // Find the closest image to the current time (before the current time)
    let closestImageItem = photoItemsCombined[0] || null;
    if (!closestImageItem) return;

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

    const closestImageTimeStr = closestImageItem.dateTaken.split("T")[1];

    const targetElement = document.querySelector(`[data-time="${closestImageTimeStr}"]`);
    targetElement?.scrollIntoView({ behavior: "smooth" });

    if (closestImageItem.ID !== mostRecentImage?.ID) {
      setMostRecentImage(closestImageItem);
    }
  }, [appSeconds, photoItemsCombined, mostRecentImage]);

  if (isLoading) {
    return <div>Loading Photos...</div>;
  }
  return (
    <div className={styles.imageComponentContainer}>
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
      </div>
      <div className={styles.imageThumbsContainer}>
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
                setClock(appSecondsFromTimeStr(item.dateTaken.split("T")[1]));
              }}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setClock(appSecondsFromTimeStr(item.dateTaken.split("T")[1]));
                }
              }}
            >
              {visibleImages.has(index) ? (
                <img src={getImageUrl(item, "thumb")} alt={item.ID} loading="lazy" />
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

export default Photos;

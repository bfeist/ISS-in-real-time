import { FunctionComponent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./photos.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";
import { useDateEarthPhotography, useDatePhotosFlickr } from "api/useDateSpecificData";

const Photos: FunctionComponent<{ height?: "tall" | "short" }> = ({ height = "short" }) => {
  const { selectedDate, setClock } = useStateClock();
  const { data: earthPhotographyItems = [], isLoading: earthPhotographyIsLoading } =
    useDateEarthPhotography(selectedDate || "");
  const { data: flickrPhotosItems = [], isLoading: flickrPhotosIsLoading } = useDatePhotosFlickr(
    selectedDate || ""
  );

  const isLoading = earthPhotographyIsLoading || flickrPhotosIsLoading;

  const photoItemsCombined = useMemo(
    () =>
      [...earthPhotographyItems, ...flickrPhotosItems].sort(
        (a, b) => new Date(a.dateTaken).getTime() - new Date(b.dateTaken).getTime()
      ),
    [earthPhotographyItems, flickrPhotosItems]
  );

  const issirtDataBaseUrl = import.meta.env.VITE_IMAGE_BASE_URL.replace("\\x3a", ":");
  const flickrBaseUrl = "https://live.staticflickr.com/";

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

import { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import styles from "./photos.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateToggle } from "store/hooks/useStateToggle";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";
import PhotoToggle from "./photoToggle";
import { useDateEarthPhotography, useDatePhotosFlickr } from "api/useDateSpecificData";
import SourceButton from "../common/sourceButton";
import PhotosThumbs from "./photosThumbs";

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
  const [appSeconds, setAppSeconds] = useState(0);
  const [mostRecentImage, setMostRecentImage] = useState(null);
  const [isHoveringContainer, setIsHoveringContainer] = useState(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [clickedPhotoFilename, setClickedPhotoFilename] = useState<string | null>(null);
  const [lastAppSeconds, setLastAppSeconds] = useState<number | null>(null);

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

  // Update most recent image based on current time
  useEffect(() => {
    if (!appSeconds || photoItemsCombined.length === 0) return;

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

    if (closestImageItem && closestImageItem.ID !== mostRecentImage?.ID) {
      setMostRecentImage(closestImageItem);
    }
  }, [appSeconds, photoItemsCombined, mostRecentImage, clickedPhotoFilename]);

  const handleThumbnailClick = useCallback(
    (item: PhotoItem) => {
      const targetTime = appSecondsFromTimeStr(item.dateTaken.split("T")[1]);
      setClock(targetTime);
      setClickedPhotoFilename(item.ID);
    },
    [setClock]
  );

  const handleAutoScrollToggle = useCallback((enabled: boolean) => {
    setIsAutoScrollEnabled(enabled);
  }, []);

  const handleDisableAutoScroll = useCallback(() => {
    setIsAutoScrollEnabled(false);
  }, []);

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

      <PhotosThumbs
        photoItemsCombined={photoItemsCombined}
        appSeconds={appSeconds}
        mostRecentImage={mostRecentImage}
        clickedPhotoFilename={clickedPhotoFilename}
        lastAppSeconds={lastAppSeconds}
        isAutoScrollEnabled={isAutoScrollEnabled}
        getImageUrl={getImageUrl}
        onThumbnailClick={handleThumbnailClick}
        onAutoScrollToggle={handleAutoScrollToggle}
        onDisableAutoScroll={handleDisableAutoScroll}
        setClickedPhotoFilename={setClickedPhotoFilename}
        setLastAppSeconds={setLastAppSeconds}
      />
    </div>
  );
};

export default Photos;

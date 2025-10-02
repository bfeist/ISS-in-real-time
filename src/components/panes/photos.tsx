import { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import styles from "./photos.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateToggle } from "store/hooks/useStateToggle";
import { useStateDayNight } from "store/hooks/useStateDayNight";
import { appSecondsFromDateTime } from "utils/time";
import { generateEarthPhotoSourceUrl } from "utils/earthPhotos";
import { getSunLightingAtTime } from "utils/day-night";
import ClockInterval from "./clockInterval";
import PhotoToggle from "./photoToggle";
import { useDateEarthPhotography, useDatePhotosFlickr } from "api/useDateSpecificData";
import SourceButton from "../common/sourceButton";
import PhotosThumbs from "./photosThumbs";

const Photos: FunctionComponent<{ height?: "tall" | "short" }> = ({ height = "short" }) => {
  const { selectedDate, setClock } = useStateClock();
  const { showEarthPhotos, showTimelapsePhotos, showMissionPhotos } = useStateToggle();
  const { dayNight } = useStateDayNight();

  const { data: earthPhotographyItems = [], isLoading: earthPhotographyIsLoading } =
    useDateEarthPhotography(selectedDate || "");
  const { data: flickrPhotosItems = [], isLoading: flickrPhotosIsLoading } = useDatePhotosFlickr(
    selectedDate || ""
  );

  // State
  const [appSeconds, setAppSeconds] = useState<number>(0);
  const [mostRecentImage, setMostRecentImage] = useState<PhotoItem | null>(null);
  const [isHoveringContainer, setIsHoveringContainer] = useState(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [clickedPhotoFilename, setClickedPhotoFilename] = useState<string | null>(null);
  const [lastAppSeconds, setLastAppSeconds] = useState<number | null>(null);

  // Computed values
  const isLoading = earthPhotographyIsLoading || flickrPhotosIsLoading;

  // Calculate photo counts by type
  const earthPhotosCount = useMemo(() => {
    return earthPhotographyItems.filter((photo) => !photo.isTimelapse).length;
  }, [earthPhotographyItems]);

  const timelapsePhotosCount = useMemo(() => {
    return earthPhotographyItems.filter((photo) => photo.isTimelapse).length;
  }, [earthPhotographyItems]);

  const missionPhotosCount = useMemo(() => {
    return flickrPhotosItems.length;
  }, [flickrPhotosItems]);

  // Combined and sorted photos
  const photoItemsCombined = useMemo(() => {
    // Earth photos logic: show based on toggle combinations
    // If both toggles are on: show all earth photos
    // If only showEarthPhotos is on: show only non-timelapse earth photos
    // If only showTimelapsePhotos is on: show only timelapse earth photos
    // If both are off: show no earth photos
    let earthPhotos: PhotoItemEarth[] = [];

    if (showEarthPhotos && showTimelapsePhotos) {
      // Both toggles on: show all earth photos
      earthPhotos = earthPhotographyItems;
    } else if (showEarthPhotos && !showTimelapsePhotos) {
      // Only earth photos on: show non-timelapse earth photos
      earthPhotos = earthPhotographyItems.filter((photo) => !photo.isTimelapse);
    } else if (!showEarthPhotos && showTimelapsePhotos) {
      // Only timelapse on: show timelapse earth photos
      earthPhotos = earthPhotographyItems.filter((photo) => photo.isTimelapse);
    }
    // If both are off: earthPhotos remains empty array

    const missionPhotos: PhotoItemFlickr[] = showMissionPhotos ? flickrPhotosItems : [];

    const allPhotos: PhotoItem[] = [...earthPhotos, ...missionPhotos];

    return allPhotos.sort(
      (a, b) => new Date(a.dateTaken).getTime() - new Date(b.dateTaken).getTime()
    );
  }, [
    earthPhotographyItems,
    flickrPhotosItems,
    showEarthPhotos,
    showMissionPhotos,
    showTimelapsePhotos,
  ]);

  // URL generation
  const flickrBaseUrl = "https://live.staticflickr.com";

  const getImageUrl = useCallback(
    (photoItem: PhotoItem, size: "small" | "medium" | "large") => {
      const { type } = photoItem;

      switch (type) {
        case "photos_earth":
          // Earth photos now have properly generated URLs for all sizes
          if (size === "small") {
            return photoItem.smallUrl || "";
          } else if (size === "medium") {
            return photoItem.medUrl || "";
          }
          return photoItem.largeUrl || "";

        case "photos_flickr":
          if (size === "small") {
            return `${flickrBaseUrl}/${photoItem.smallUrl || ""}`;
          } else if (size === "medium") {
            return `${flickrBaseUrl}/${photoItem.medUrl || photoItem.smallUrl || ""}`;
          }
          return `${flickrBaseUrl}/${photoItem.largeUrl || photoItem.medUrl || photoItem.smallUrl || ""}`;

        default:
          return "";
      }
    },
    [flickrBaseUrl]
  );

  // Update most recent image based on current time
  useEffect(() => {
    if (!Number.isFinite(appSeconds)) {
      return;
    }

    if (photoItemsCombined.length === 0) {
      setMostRecentImage(null);
      return;
    }

    // Find images at current time or closest before
    const photoEntries = photoItemsCombined
      .map((imageItem) => {
        const imageSeconds = appSecondsFromDateTime(imageItem.dateTaken);
        if (imageSeconds === null) {
          return null;
        }

        return { imageItem, imageSeconds };
      })
      .filter((entry): entry is { imageItem: PhotoItem; imageSeconds: number } => entry !== null);

    const invalidPhotoFallback = photoItemsCombined.length
      ? photoItemsCombined.find((photo) => photo.nasaId === clickedPhotoFilename) ||
        photoItemsCombined[0]
      : null;

    if (photoEntries.length === 0) {
      if (invalidPhotoFallback && invalidPhotoFallback.nasaId !== mostRecentImage?.nasaId) {
        setMostRecentImage(invalidPhotoFallback);
      }
      return;
    }

    const imagesAtCurrentTime = photoEntries
      .filter(({ imageSeconds }) => imageSeconds === appSeconds)
      .map(({ imageItem }) => imageItem);

    let closestImageItem = null;

    if (imagesAtCurrentTime.length > 0) {
      // Prioritize clicked image if available
      if (clickedPhotoFilename) {
        const clickedImage = imagesAtCurrentTime.find((img) => img.nasaId === clickedPhotoFilename);
        closestImageItem = clickedImage || imagesAtCurrentTime[0];
      } else {
        closestImageItem = imagesAtCurrentTime[0];
      }
    } else {
      // Find closest image before current time
      closestImageItem = photoEntries[0]?.imageItem || invalidPhotoFallback || null;

      if (closestImageItem) {
        let appSecondsDiff = null;
        for (const { imageItem, imageSeconds } of photoEntries) {
          if (imageSeconds > appSeconds) break;

          const diff = Math.abs(appSeconds - imageSeconds);
          if (appSecondsDiff === null || diff <= appSecondsDiff) {
            appSecondsDiff = diff;
            closestImageItem = imageItem;
          }
        }
      }
    }

    if (closestImageItem && closestImageItem.nasaId !== mostRecentImage?.nasaId) {
      setMostRecentImage(closestImageItem);
    }
  }, [appSeconds, photoItemsCombined, mostRecentImage, clickedPhotoFilename]);

  const handleThumbnailClick = useCallback(
    (item: PhotoItem) => {
      const targetTime = appSecondsFromDateTime(item.dateTaken);
      if (targetTime !== null) {
        setClock(targetTime);
      }
      setClickedPhotoFilename(item.nasaId);
    },
    [setClock]
  );

  const handleAutoScrollToggle = useCallback((enabled: boolean) => {
    setIsAutoScrollEnabled(enabled);
  }, []);

  const handleDisableAutoScroll = useCallback(() => {
    setIsAutoScrollEnabled(false);
  }, []);

  // Helper function to build Earth photo metadata
  const getEarthPhotoMetadata = useCallback((photo: PhotoItemEarth) => {
    const metadata: { camera?: string; description?: string } = {};

    // Build camera string from optional properties
    const cameraParts: string[] = [];
    if (photo.camera) cameraParts.push(photo.camera);
    if (photo.focalLength !== undefined) cameraParts.push(`${photo.focalLength}mm`);

    if (cameraParts.length > 0) {
      metadata.camera = cameraParts.join(" ");
    }

    // Build description from available optional fields
    const descriptionParts: string[] = [];
    if (photo.caption) descriptionParts.push(photo.caption);
    if (photo.mlFeat) descriptionParts.push(photo.mlFeat);
    if (photo.feat) descriptionParts.push(photo.feat);
    if (photo.publicFeatures) descriptionParts.push(photo.publicFeatures);

    if (descriptionParts.length > 0) {
      metadata.description = descriptionParts.join(" • ");
    }

    return metadata;
  }, []);

  // Compute Earth photo metadata for current image
  const earthPhotoMetadata = useMemo(() => {
    if (mostRecentImage?.type === "photos_earth") {
      return getEarthPhotoMetadata(mostRecentImage);
    }
    return null;
  }, [mostRecentImage, getEarthPhotoMetadata]);

  if (isLoading) {
    return <div>Loading Photos...</div>;
  }

  return (
    <div
      className={styles.imageComponentContainer}
      onMouseEnter={() => setIsHoveringContainer(true)}
      onMouseLeave={() => setIsHoveringContainer(false)}
    >
      <PhotoToggle
        isVisible={isHoveringContainer}
        earthPhotosCount={earthPhotosCount}
        timelapsePhotosCount={timelapsePhotosCount}
        missionPhotosCount={missionPhotosCount}
      />
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
          <img src={getImageUrl(mostRecentImage, "medium")} alt={mostRecentImage.nasaId} />
        )}
        {mostRecentImage && mostRecentImage.type === "photos_flickr" && (
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
        {mostRecentImage && mostRecentImage.type === "photos_earth" && (
          <div className={styles.descriptionOverlay}>
            <div className={styles.descriptionContent}>
              <SourceButton
                onClick={(e) => {
                  e.stopPropagation();
                  // Determine current illumination based on appSeconds and dayNight data
                  const illumination = getSunLightingAtTime(dayNight, appSeconds);
                  const sourceUrl = generateEarthPhotoSourceUrl({
                    nasaId: mostRecentImage.nasaId,
                    hasCoordinates: true, // Always generate URL; NASA site will handle photos not in ExplorePhotos
                    illumination,
                  });
                  if (sourceUrl) {
                    window.open(sourceUrl, "_blank");
                  }
                }}
                variant="iconOnly"
              >
                <FontAwesomeIcon icon={faExternalLinkAlt} />
              </SourceButton>
              {earthPhotoMetadata && earthPhotoMetadata.camera && (
                <div className={styles.metadataRow}>
                  <strong>Camera:</strong> {earthPhotoMetadata.camera}
                </div>
              )}
              {earthPhotoMetadata && earthPhotoMetadata.description && (
                <p>{earthPhotoMetadata.description}</p>
              )}
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

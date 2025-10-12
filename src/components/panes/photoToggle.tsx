import { FunctionComponent } from "react";
import { useStateToggle } from "store/hooks/useStateToggle";
import { faEarth, faRocket, faClock } from "@fortawesome/free-solid-svg-icons";
import IconButton from "../common/iconButton";
import styles from "./photoToggle.module.css";

const PhotoToggle: FunctionComponent<{
  isVisible: boolean;
  earthPhotosCount: number;
  timelapsePhotosCount: number;
  missionPhotosCount: number;
}> = ({ isVisible, earthPhotosCount, timelapsePhotosCount, missionPhotosCount }) => {
  const {
    showEarthPhotos,
    setShowEarthPhotos,
    showMissionPhotos,
    setShowMissionPhotos,
    showTimelapsePhotos,
    setShowTimelapsePhotos,
  } = useStateToggle();

  return (
    <div className={`${styles.toggleContainer} ${isVisible ? styles.visible : ""}`}>
      <div className={styles.toggleButton}>
        <IconButton
          icon={faEarth}
          onClick={() => setShowEarthPhotos(!showEarthPhotos)}
          enabled={earthPhotosCount > 0}
          selected={showEarthPhotos}
          style={{
            opacity: showEarthPhotos ? 1 : 0.5,
          }}
          tooltipContent={
            earthPhotosCount > 0
              ? showEarthPhotos
                ? "Hide Earth Photos"
                : "Show Earth Photos"
              : "Earth Photos Unavailable"
          }
        />
      </div>
      <div className={styles.toggleButton}>
        <IconButton
          icon={faClock}
          onClick={() => setShowTimelapsePhotos(!showTimelapsePhotos)}
          enabled={timelapsePhotosCount > 0}
          selected={showTimelapsePhotos}
          style={{
            opacity: showTimelapsePhotos ? 1 : 0.5,
          }}
          tooltipContent={
            timelapsePhotosCount > 0
              ? showTimelapsePhotos
                ? "Hide Timelapse Photos"
                : "Show Timelapse Photos"
              : "Timelapse Photos Unavailable"
          }
        />
      </div>
      <div className={styles.toggleButton}>
        <IconButton
          icon={faRocket}
          onClick={() => setShowMissionPhotos(!showMissionPhotos)}
          enabled={missionPhotosCount > 0}
          selected={showMissionPhotos}
          style={{
            opacity: showMissionPhotos ? 1 : 0.5,
          }}
          tooltipContent={
            missionPhotosCount > 0
              ? showMissionPhotos
                ? "Hide Mission Photos"
                : "Show Mission Photos"
              : "Mission Photos Unavailable"
          }
        />
      </div>
    </div>
  );
};

export default PhotoToggle;

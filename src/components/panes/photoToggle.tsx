import { FunctionComponent } from "react";
import { useStateToggle } from "store/hooks/useStateToggle";
import { faEarth, faRocket, faClock } from "@fortawesome/free-solid-svg-icons";
import IconButton from "../common/iconButton";
import styles from "./photoToggle.module.css";

const PhotoToggle: FunctionComponent<{
  isVisible: boolean;
}> = ({ isVisible }) => {
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
          style={{
            opacity: showEarthPhotos ? 1 : 0.5,
            backgroundColor: showEarthPhotos ? "rgb(255 255 255 / 10%)" : "transparent",
          }}
          data-tooltip-id="source-button-tooltip"
          data-tooltip-content={showEarthPhotos ? "Show Earth Photos" : "Hide Earth Photos"}
          data-tooltip-place="left"
        />
      </div>
      <div className={styles.toggleButton}>
        <IconButton
          icon={faClock}
          onClick={() => setShowTimelapsePhotos(!showTimelapsePhotos)}
          style={{
            opacity: showTimelapsePhotos ? 1 : 0.5,
            backgroundColor: showTimelapsePhotos ? "rgb(255 255 255 / 10%)" : "transparent",
          }}
          data-tooltip-id="source-button-tooltip"
          data-tooltip-content={"Toggle Timelapse Earth Photos"}
          data-tooltip-place="left"
        />
      </div>
      <div className={styles.toggleButton}>
        <IconButton
          icon={faRocket}
          onClick={() => setShowMissionPhotos(!showMissionPhotos)}
          style={{
            opacity: showMissionPhotos ? 1 : 0.5,
            backgroundColor: showMissionPhotos ? "rgb(255 255 255 / 10%)" : "transparent",
          }}
          data-tooltip-id="source-button-tooltip"
          data-tooltip-content={"Toggle Mission Photos"}
          data-tooltip-place="left"
        />
      </div>
    </div>
  );
};

export default PhotoToggle;

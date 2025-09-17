import { FunctionComponent } from "react";
import { useStateToggle } from "store/hooks/useStateToggle";
import { faEarth, faRocket } from "@fortawesome/free-solid-svg-icons";
import IconButton from "./iconButton";
import styles from "./photoToggle.module.css";

const PhotoToggle: FunctionComponent<{
  isVisible: boolean;
}> = ({ isVisible }) => {
  const { showEarthPhotos, setShowEarthPhotos, showMissionPhotos, setShowMissionPhotos } =
    useStateToggle();

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
        />
      </div>
    </div>
  );
};

export default PhotoToggle;

import { FunctionComponent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faVideoSlash } from "@fortawesome/free-solid-svg-icons";
import styles from "./videoNone.module.css";

interface NoVideoProps {
  message?: string;
}

const VideoNone: FunctionComponent<NoVideoProps> = ({
  message = "Video unavailable at this time",
}) => {
  return (
    <div className={styles.noVideoContainer}>
      <FontAwesomeIcon icon={faVideoSlash} className={styles.icon} />
      <div className={styles.message}>{message}</div>
    </div>
  );
};

export default VideoNone;

import { FunctionComponent } from "react";
import { useStateToggle } from "store/hooks/useStateToggle";
import { faGlobe, faMap } from "@fortawesome/free-solid-svg-icons";
import IconButton from "../common/iconButton";
import styles from "./globeMapToggle.module.css";

interface GlobeMapToggleProps {
  isVisible: boolean;
}

const GlobeMapToggle: FunctionComponent<GlobeMapToggleProps> = ({ isVisible }) => {
  const { showGlobe, setShowGlobe } = useStateToggle();

  if (!isVisible) return null;

  return (
    <div className={styles.toggleButton}>
      <IconButton
        icon={showGlobe ? faMap : faGlobe}
        onClick={() => setShowGlobe(!showGlobe)}
        data-tooltip-id="source-button-tooltip"
        data-tooltip-content={"Toggle Globe/Map View"}
        data-tooltip-place="left"
      />
    </div>
  );
};

export default GlobeMapToggle;

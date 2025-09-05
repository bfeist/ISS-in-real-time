import { FunctionComponent } from "react";
import { useStateToggle } from "store/hooks/useStateToggle";
import { faGlobe, faMap } from "@fortawesome/free-solid-svg-icons";
import IconButton from "./iconButton";
import styles from "./globeMapToggle.module.css";

interface GlobeMapToggleProps {
  isVisible: boolean;
}

const GlobeMapToggle: FunctionComponent<GlobeMapToggleProps> = ({ isVisible }) => {
  const { showGlobe, setShowGlobe } = useStateToggle();

  if (!isVisible) return null;

  return (
    <div className={styles.toggleButton}>
      <IconButton icon={showGlobe ? faMap : faGlobe} onClick={() => setShowGlobe(!showGlobe)} />
    </div>
  );
};

export default GlobeMapToggle;

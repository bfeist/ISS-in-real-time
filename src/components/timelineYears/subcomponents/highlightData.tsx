import { FunctionComponent, useState } from "react";
import CrewSearch from "./crewSearch";
import LayoutTestComponent from "./layoutTestComponent";
import styles from "./highlightData.module.css";
import { useStateContentHighlights } from "store/hooks/useStateContentHighlights";

const HighlightData: FunctionComponent = () => {
  const { contentHighlights, toggleContentHighlight } = useStateContentHighlights();
  const [showCrewSearch, setShowCrewSearch] = useState(false);
  const [showLayoutTest, setShowLayoutTest] = useState(false);

  // Define the available content types for highlighting
  const contentTypes = [
    { key: "comm", label: "Comm" },
    { key: "vvComm", label: "Comm (visiting vehicle)" },
    { key: "video", label: "Video" },
    { key: "eva", label: "EVA (spacewalk)" },
    { key: "blog", label: "Articles" },
    { key: "earthPhotos", label: "Earth Photos" },
    { key: "flickrPhotos", label: "Mission Photos" },
  ];

  return (
    <div className={styles.searchContainer}>
      <div className={styles.searchItems}>
        <div>Days with (all):</div>
        {contentTypes.map((contentType) => (
          <label key={contentType.key} className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={contentHighlights.includes(contentType.key)}
              onChange={() => toggleContentHighlight(contentType.key)}
            />
            {contentType.label}
          </label>
        ))}
        <div className={styles.buttonWrapper}>
          <button
            className={styles.toggleButton}
            onClick={() => setShowCrewSearch(!showCrewSearch)}
          >
            Crew Search
          </button>
          {showCrewSearch && (
            <div className={styles.overlayPanel}>
              <CrewSearch />
            </div>
          )}
        </div>
        <div className={styles.buttonWrapper}>
          <button
            className={styles.toggleButton}
            onClick={() => setShowLayoutTest(!showLayoutTest)}
          >
            Layout Test
          </button>
          {showLayoutTest && (
            <div className={styles.overlayPanel}>
              <LayoutTestComponent />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HighlightData;

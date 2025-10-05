import { FunctionComponent, useState } from "react";
import HighlightCrew from "./highlightCrew";
import HighlightExpeditions from "./highlightExpeditions";
import LayoutTestComponent from "./layoutTestComponent";
import styles from "./highlightData.module.css";
import { useStateContentHighlights } from "store/hooks/useStateContentHighlights";

const HighlightData: FunctionComponent<{
  onCloseMegaOverlay?: () => void;
}> = ({ onCloseMegaOverlay }) => {
  const { contentHighlights, toggleContentHighlight } = useStateContentHighlights();
  const [showLayoutTest, setShowLayoutTest] = useState(false);

  // Define the available content types for highlighting
  const contentTypes = [
    { key: "comm", label: "Comm" },
    { key: "vvComm", label: "Spacecraft Comm" },
    { key: "earthPhotos", label: "Earth Photos" },
    { key: "flickrPhotos", label: "Mission Photos" },
    { key: "video", label: "Video" },
    { key: "blog", label: "Articles" },
    { key: "eva", label: "EVA (spacewalks)" },
  ];

  return (
    <div
      className={styles.highlightContainer}
      onClick={() => onCloseMegaOverlay?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onCloseMegaOverlay?.();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className={styles.highlightItems}>
        <div className={styles.highlightTableWrapper}>
          {/* Column 1: Highlight Data */}
          <div className={styles.column}>
            <div className={styles.columnHeader}>Highlight Data</div>
            <div className={styles.columnBody}>
              <span className={styles.headerText}>Days with (all):</span>
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
            </div>
          </div>

          {/* Column 2: Highlight Crew */}
          <div className={styles.column}>
            <div className={styles.columnHeader}>Highlight Crew</div>
            <div className={styles.columnBody}>
              <HighlightCrew />
            </div>
          </div>

          {/* Column 3: Highlight Expeditions */}
          <div className={styles.column}>
            <div className={styles.columnHeader}>Highlight Expeditions</div>
            <div className={styles.columnBody}>
              <HighlightExpeditions />
            </div>
          </div>
        </div>

        <div className={`${styles.buttonWrapper} ${styles.layoutTestWrapper}`}>
          <button
            className={styles.toggleButton}
            onClick={() => setShowLayoutTest(!showLayoutTest)}
            style={{ display: "none" }}
          >
            Layout Test
          </button>
          {showLayoutTest && (
            <div className={styles.overlayPanelLayoutTest}>
              <LayoutTestComponent onClose={() => setShowLayoutTest(false)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HighlightData;

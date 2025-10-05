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
  const [activeTab, setActiveTab] = useState<"data" | "crew" | "expeditions">("data");

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
        {/* Tab Navigation - visible on mobile */}
        <div className={styles.tabNavigation}>
          <button
            className={`${styles.tabButton} ${activeTab === "data" ? styles.tabButtonActive : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab("data");
            }}
          >
            Highlight Data
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === "crew" ? styles.tabButtonActive : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab("crew");
            }}
          >
            Highlight Crew
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === "expeditions" ? styles.tabButtonActive : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab("expeditions");
            }}
          >
            Highlight Expeditions
          </button>
        </div>

        <div className={styles.highlightTableWrapper}>
          {/* Column 1: Highlight Data */}
          <div className={`${styles.column} ${activeTab === "data" ? styles.columnActive : ""}`}>
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
          <div className={`${styles.column} ${activeTab === "crew" ? styles.columnActive : ""}`}>
            <div className={styles.columnHeader}>Highlight Crew</div>
            <div className={styles.columnBody}>
              <HighlightCrew />
            </div>
          </div>

          {/* Column 3: Highlight Expeditions */}
          <div
            className={`${styles.column} ${activeTab === "expeditions" ? styles.columnActive : ""}`}
          >
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

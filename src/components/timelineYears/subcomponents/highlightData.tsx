import { FunctionComponent, useState } from "react";
import HighlightCrew from "./highlightCrew";
import HighlightExpeditions from "./highlightExpeditions";
import LayoutTestComponent from "./layoutTestComponent";
import styles from "./highlightData.module.css";
import { useStateContentHighlights } from "store/hooks/useStateContentHighlights";
import { useStateSearch } from "store/hooks/useStateSearch";
import IconButton from "../../common/iconButton";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";

const HighlightData: FunctionComponent<{
  onCloseMegaOverlay?: () => void;
}> = ({ onCloseMegaOverlay }) => {
  const { contentHighlights, toggleContentHighlight } = useStateContentHighlights();
  const { selectedCrewMember, selectedExpedition, clearAllSearchHighlights } = useStateSearch();
  const [showSearchCrew, setShowSearchCrew] = useState(false);
  const [showSearchExpeditions, setShowSearchExpeditions] = useState(false);
  const [showLayoutTest, setShowLayoutTest] = useState(false);

  // Define the available content types for highlighting
  const contentTypes = [
    { key: "comm", label: "Comm" },
    { key: "vvComm", label: "Spacecraft" },
    { key: "earthPhotos", label: "Earth Photos" },
    { key: "flickrPhotos", label: "Mission Photos" },
    { key: "video", label: "Video" },
    { key: "blog", label: "Articles" },
    { key: "eva", label: "EVA" },
  ];

  // Check if any search highlights are active
  const hasActiveSearchHighlights = selectedCrewMember || selectedExpedition;

  const getSearchHighlightLabel = () => {
    if (selectedCrewMember && selectedExpedition) {
      return `${selectedCrewMember.name} & Expedition ${selectedExpedition.expedition}`;
    } else if (selectedCrewMember) {
      return selectedCrewMember.name;
    } else if (selectedExpedition) {
      return `Expedition ${selectedExpedition.expedition}`;
    }
    return "";
  };

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
              <div className={styles.buttonWrapper}>
                <IconButton
                  icon={faMagnifyingGlass}
                  onClick={() => {
                    const newShow = !showSearchCrew;
                    setShowSearchCrew(newShow);
                    if (newShow) setShowSearchExpeditions(false);
                  }}
                  label="Crew"
                  style={{ width: "100px" }}
                  className={styles.toggleButton}
                />
              </div>
              {showSearchCrew && (
                <div className={styles.overlayPanelSearch}>
                  <HighlightCrew onClose={() => setShowSearchCrew(false)} />
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Highlight Expeditions */}
          <div className={styles.column}>
            <div className={styles.columnHeader}>Highlight Expeditions</div>
            <div className={styles.columnBody}>
              <div className={styles.buttonWrapper}>
                <IconButton
                  icon={faMagnifyingGlass}
                  onClick={() => {
                    const newShow = !showSearchExpeditions;
                    setShowSearchExpeditions(newShow);
                    if (newShow) setShowSearchCrew(false);
                  }}
                  label="Expeditions"
                  style={{ width: "100px" }}
                  className={styles.toggleButton}
                />
              </div>
              {showSearchExpeditions && (
                <div className={styles.overlayPanelSearch}>
                  <HighlightExpeditions onClose={() => setShowSearchExpeditions(false)} />
                </div>
              )}
            </div>
          </div>
        </div>

        {hasActiveSearchHighlights && (
          <div className={styles.searchIndicator}>
            <span className={styles.searchIndicatorLabel}>
              Highlight: {getSearchHighlightLabel()}
            </span>
            <button
              className={styles.clearSearchButton}
              onClick={() => {
                clearAllSearchHighlights();
                setShowSearchCrew(false);
                setShowSearchExpeditions(false);
              }}
              title="Clear search highlights"
            >
              ×
            </button>
          </div>
        )}

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

import { FunctionComponent, useState } from "react";
import SearchCrew from "./searchCrew";
import SearchExpeditions from "./searchExpeditions";
import LayoutTestComponent from "./layoutTestComponent";
import styles from "./highlightData.module.css";
import { useStateContentHighlights } from "store/hooks/useStateContentHighlights";
import { useStateSearch } from "store/hooks/useStateSearch";
import IconButton from "../../common/iconButton";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";

const HighlightData: FunctionComponent = () => {
  const { contentHighlights, toggleContentHighlight } = useStateContentHighlights();
  const { selectedCrewMember, selectedExpedition, clearAllSearchHighlights } = useStateSearch();
  const [showSearchCrew, setShowSearchCrew] = useState(false);
  const [showSearchExpeditions, setShowSearchExpeditions] = useState(false);
  const [showLayoutTest, setShowLayoutTest] = useState(false);

  // Define the available content types for highlighting, grouped by category
  const contentTypeGroups = [
    [
      { key: "comm", label: "Comm" },
      { key: "vvComm", label: "Spacecraft" },
    ],
    [
      { key: "earthPhotos", label: "Earth Photos" },
      { key: "flickrPhotos", label: "Mission Photos" },
    ],
    [
      { key: "video", label: "Video" },
      { key: "blog", label: "Articles" },
    ],
    [{ key: "eva", label: "EVA" }],
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
    <div className={styles.highlightContainer}>
      <div className={styles.highlightItems}>
        <div className={styles.highlightWrapper}>
          <div className={styles.highlightTitle}>Highlight dates with data types:</div>
          <div className={styles.highlightTable}>
            {contentTypeGroups.map((group, groupIndex) => (
              <div key={groupIndex} className={styles.highlightCell}>
                {group.map((contentType) => (
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
            ))}
          </div>
        </div>
        <div className={styles.doubleButtonWrapper}>
          <div className={styles.buttonWrapper}>
            <IconButton
              icon={faMagnifyingGlass}
              onClick={() => {
                const newShow = !showSearchCrew;
                setShowSearchCrew(newShow);
                if (newShow) setShowSearchExpeditions(false);
              }}
              label="Crew"
            />
            {showSearchCrew && (
              <div className={styles.overlayPanel}>
                <SearchCrew onClose={() => setShowSearchCrew(false)} />
              </div>
            )}
          </div>
          <div className={styles.buttonWrapper}>
            <IconButton
              icon={faMagnifyingGlass}
              onClick={() => {
                const newShow = !showSearchExpeditions;
                setShowSearchExpeditions(newShow);
                if (newShow) setShowSearchCrew(false);
              }}
              label="Expeditions"
            />
            {showSearchExpeditions && (
              <div className={styles.overlayPanel}>
                <SearchExpeditions onClose={() => setShowSearchExpeditions(false)} />
              </div>
            )}
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

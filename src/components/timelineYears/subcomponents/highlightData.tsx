import { FunctionComponent, useState } from "react";
import Search from "./search";
import LayoutTestComponent from "./layoutTestComponent";
import styles from "./highlightData.module.css";
import { useStateContentHighlights } from "store/hooks/useStateContentHighlights";
import { useStateSearch } from "store/hooks/useStateSearch";
import IconButton from "../../common/iconButton";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";

const HighlightData: FunctionComponent = () => {
  const { contentHighlights, toggleContentHighlight } = useStateContentHighlights();
  const { selectedCrewMember, selectedExpedition, clearAllSearchHighlights } = useStateSearch();
  const [showSearch, setShowSearch] = useState(false);
  const [showLayoutTest, setShowLayoutTest] = useState(false);

  // Define the available content types for highlighting, grouped by category
  const contentTypeGroups = [
    [
      { key: "comm", label: "Comm" },
      { key: "vvComm", label: "Comm (visiting vehicle)" },
    ],
    [
      { key: "earthPhotos", label: "Earth Photos" },
      { key: "flickrPhotos", label: "Mission Photos" },
    ],
    [
      { key: "video", label: "Video" },
      { key: "blog", label: "Articles" },
    ],
    [{ key: "eva", label: "EVA (spacewalk)" }],
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
    <div className={styles.searchContainer}>
      <div className={styles.searchItems}>
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
        <div className={styles.buttonWrapper}>
          <IconButton
            icon={faMagnifyingGlass}
            onClick={() => setShowSearch(!showSearch)}
            label="Crew"
          />
          {showSearch && (
            <div className={styles.overlayPanel}>
              <Search onClose={() => setShowSearch(false)} />
            </div>
          )}
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
                setShowSearch(false);
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

import { FunctionComponent } from "react";
import CrewSearch from "./crewSearch";
import styles from "./searchComponent.module.css";
import { useStateContentHighlights } from "store/hooks/useStateContentHighlights";

const SearchComponent: FunctionComponent = () => {
  const { contentHighlights, toggleContentHighlight } = useStateContentHighlights();

  // Define the available content types for highlighting
  const contentTypes = [
    { key: "comm", label: "Comm" },
    { key: "vvComm", label: "VV Comm" },
    { key: "youtube", label: "YouTube" },
    { key: "eva", label: "EVA" },
    { key: "blog", label: "Blog" },
    { key: "activitySummary", label: "Activity Summary" },
    { key: "earthPhotography", label: "Earth Photography" },
  ];

  return (
    <div className={styles.searchContainer}>
      <div className={styles.searchItems}>
        <div className={styles.searchItem} style={{ flex: "0 0 190px" }}>
          <div className={styles.contentHeading}>Content Highlights</div>
          <div>Days with (all):</div>
          <div className={styles.checkboxContainer}>
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
        <div className={styles.searchItem}>
          <CrewSearch />
        </div>
      </div>
    </div>
  );
};

export default SearchComponent;

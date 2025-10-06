import React, { useState, useMemo, ReactNode } from "react";
import styles from "./highlightType.module.css";

export interface HighlightTypeConfig<T> {
  // Data & State
  items: T[];
  selectedItem: T | null;
  setSelectedItem: (item: T | null) => void;

  // Configuration
  placeholder: string;
  ariaLabel: string;
  clearAllTitle: string;
  itemClassName: string;

  // Functions
  getItemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  filterItem: (item: T, searchTerm: string) => boolean;
  isItemEqual: (item1: T | null, item2: T) => boolean;
}

interface HighlightTypeProps<T> {
  config: HighlightTypeConfig<T>;
}

function HighlightType<T>({ config }: HighlightTypeProps<T>): React.ReactElement {
  const {
    items,
    selectedItem,
    setSelectedItem,
    placeholder,
    ariaLabel,
    clearAllTitle,
    itemClassName,
    getItemKey,
    renderItem,
    filterItem,
    isItemEqual,
  } = config;

  const [searchTerm, setSearchTerm] = useState("");

  // Filter logic
  const filteredItems = useMemo(() => {
    return items.filter((item) => filterItem(item, searchTerm));
  }, [searchTerm, items, filterItem]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
  };

  const handleClearAll = () => {
    setSearchTerm("");
    setSelectedItem(null);
  };

  const hasActiveHighlights = selectedItem !== null;

  const handleSelectItem = (item: T) => {
    // Toggle selection: if the clicked item is already selected, deselect it
    if (isItemEqual(selectedItem, item)) {
      setSelectedItem(null);
    } else {
      setSelectedItem(item);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, item: T) => {
    // Select item when Enter or Space is pressed
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); // Prevent page scroll on space
      handleSelectItem(item);
    }
  };

  const isItemSelected = (item: T) => {
    return isItemEqual(selectedItem, item);
  };

  return (
    <div className={styles.searchContainer}>
      {/* Clear All Button */}
      {hasActiveHighlights && (
        <button className={styles.clearAllButton} onClick={handleClearAll} title={clearAllTitle}>
          Clear
        </button>
      )}

      {/* Search Input */}
      <div className={styles.searchBox}>
        <div className={styles.searchInputWrapper}>
          <input
            type="text"
            placeholder={placeholder}
            value={searchTerm}
            onChange={handleSearchChange}
            className={styles.searchInput}
          />
          {searchTerm && (
            <button
              className={styles.clearButton}
              onClick={handleClearSearch}
              aria-label="Clear filter"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Results List */}
      <div className={styles.listContainer}>
        {filteredItems.length > 0 ? (
          <ul className={styles.list} role="listbox" aria-label={ariaLabel}>
            {filteredItems.map((item) => (
              <li
                key={getItemKey(item)}
                className={`${styles.listItem} ${isItemSelected(item) ? styles.selected : ""} ${styles[itemClassName]}`}
                onClick={() => handleSelectItem(item)}
                onKeyDown={(e) => handleKeyDown(e, item)}
                tabIndex={0}
                role="option"
                aria-selected={isItemSelected(item)}
              >
                {renderItem(item)}
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.noResults}>No items found</div>
        )}
      </div>
    </div>
  );
}

// Dummy references to satisfy CSS modules linter for variant classes used dynamically via itemClassName
const _unusedCrewItem = styles.crewItem;
const _unusedExpeditionItem = styles.expeditionItem;
const _unusedNotableItem = styles.notableItem;

export default HighlightType;

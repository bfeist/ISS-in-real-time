import React, { useState, FunctionComponent, useMemo } from "react";
import styles from "./searchExpeditions.module.css";
import { useStateSearch } from "store/hooks/useStateSearch";
import { useGeneralExpeditionInfo } from "api/useGeneralData";
import CloseButton from "components/common/closeButton";

interface SearchExpeditionsProps {
  onClose?: () => void;
}

const SearchExpeditions: FunctionComponent<SearchExpeditionsProps> = ({ onClose }) => {
  const { data: expeditionInfo } = useGeneralExpeditionInfo();
  const { selectedExpedition, setSelectedExpedition } = useStateSearch();

  const [searchTerm, setSearchTerm] = useState("");

  // Generate expedition list for display
  const expeditions: ExpeditionInfo[] = useMemo(() => {
    if (!expeditionInfo || expeditionInfo.length === 0) {
      return [];
    }
    // Sort expeditions by expedition number in descending order (most recent first)
    return expeditionInfo.slice().sort((a, b) => b.expedition - a.expedition);
  }, [expeditionInfo]);

  // Filter logic for expeditions
  const filteredItems = useMemo(() => {
    return expeditions.filter((expedition) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        expedition.expedition.toString().includes(searchTerm) ||
        expedition.expeditionBlurb?.toLowerCase().includes(searchLower)
      );
    });
  }, [searchTerm, expeditions]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
  };

  const handleClearAll = () => {
    setSearchTerm("");
    setSelectedExpedition(null);
    onClose?.();
  };

  const hasActiveHighlights = selectedExpedition;

  const handleSelectItem = (item: ExpeditionInfo) => {
    // Toggle selection: if the clicked expedition is already selected, deselect it
    if (selectedExpedition?.expedition === item.expedition) {
      setSelectedExpedition(null);
    } else {
      setSelectedExpedition(item);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, item: ExpeditionInfo) => {
    // Select item when Enter or Space is pressed
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); // Prevent page scroll on space
      handleSelectItem(item);
    }
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const formatOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };

    return `${startDate.toLocaleDateString("en-US", formatOptions)} - ${endDate.toLocaleDateString("en-US", formatOptions)}`;
  };

  const isItemSelected = (item: ExpeditionInfo) => {
    return selectedExpedition?.expedition === item.expedition;
  };

  const getPlaceholderText = () => {
    return "Filter expeditions...";
  };

  const getAriaLabel = () => {
    return "Expeditions list";
  };

  const renderListItem = (item: ExpeditionInfo) => {
    return (
      <div className={styles.expeditionNumber}>
        Expedition {item.expedition} -{" "}
        <span className={styles.expeditionDate}>{formatDateRange(item.start, item.end)}</span>
      </div>
    );
  };

  const getItemKey = (item: ExpeditionInfo) => {
    return item.expedition.toString();
  };

  return (
    <div className={styles.searchContainer}>
      {/* Header with Close Button */}
      {onClose && (
        <div className={styles.header}>
          <h3>Highlight Expeditions</h3>
          <CloseButton
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
        </div>
      )}

      {/* Clear All Button */}
      {hasActiveHighlights && (
        <div className={styles.tabContainer}>
          <button
            className={styles.clearAllButton}
            onClick={handleClearAll}
            title="Clear expedition highlights"
          >
            Clear
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className={styles.searchBox}>
        <div className={styles.searchInputWrapper}>
          <input
            type="text"
            placeholder={getPlaceholderText()}
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
          <ul className={styles.list} role="listbox" aria-label={getAriaLabel()}>
            {filteredItems.map((item) => (
              <li
                key={getItemKey(item)}
                className={`${styles.listItem} ${isItemSelected(item) ? styles.selected : ""} ${styles.expeditionItem}`}
                onClick={() => handleSelectItem(item)}
                onKeyDown={(e) => handleKeyDown(e, item)}
                tabIndex={0}
                role="option"
                aria-selected={isItemSelected(item)}
              >
                {renderListItem(item)}
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.noResults}>No expeditions found</div>
        )}
      </div>
    </div>
  );
};

export default SearchExpeditions;

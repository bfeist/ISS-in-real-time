import React, { useState, FunctionComponent, useMemo } from "react";
import styles from "./highlightCrew.module.css";
import { useStateSearch } from "store/hooks/useStateSearch";
import { useGeneralCrewArrDep } from "api/useGeneralData";
import CloseButton from "components/common/closeButton";

interface HighlightCrewProps {
  onClose?: () => void;
}

const HighlightCrew: FunctionComponent<HighlightCrewProps> = ({ onClose }) => {
  const { data: crewArrDep } = useGeneralCrewArrDep();
  const { selectedCrewMember, setSelectedCrewMember } = useStateSearch();

  const [searchTerm, setSearchTerm] = useState("");

  // Generate unique crew list for display
  const crewMembers: CrewMember[] = useMemo(() => {
    if (!crewArrDep || crewArrDep.length === 0) {
      return [];
    }
    // Create a map to track unique crew members by name
    const uniqueCrewMap = new Map<string, CrewArrDepItem>();

    // For each crew member, only keep the most recent visit (based on arrival date)
    crewArrDep.forEach((crew) => {
      const existingCrew = uniqueCrewMap.get(crew.name_first + " " + crew.name_last);

      // If this is the first time we're seeing this name, or this visit is more recent
      if (!existingCrew || new Date(crew.arrivalDate) > new Date(existingCrew.arrivalDate)) {
        uniqueCrewMap.set(crew.name_first + " " + crew.name_last, crew);
      }
    });

    // Convert the map back to an array and format for display
    return Array.from(uniqueCrewMap.values())
      .map((crew) => ({
        name: crew.name_first + " " + crew.name_last,
        nationality: crew.nationality,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically by name
  }, [crewArrDep]);

  // Filter logic for crew
  const filteredItems = useMemo(() => {
    return crewMembers.filter((member) =>
      member.name?.toLowerCase().includes(searchTerm?.toLowerCase())
    );
  }, [searchTerm, crewMembers]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
  };

  const handleClearAll = () => {
    setSearchTerm("");
    setSelectedCrewMember(null);
    onClose?.();
  };

  const hasActiveHighlights = selectedCrewMember;

  const handleSelectItem = (item: CrewMember) => {
    // Toggle selection: if the clicked member is already selected, deselect it
    if (selectedCrewMember?.name === item.name) {
      setSelectedCrewMember(null);
    } else {
      setSelectedCrewMember(item);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, item: CrewMember) => {
    // Select item when Enter or Space is pressed
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); // Prevent page scroll on space
      handleSelectItem(item);
    }
  };

  const isItemSelected = (item: CrewMember) => {
    return selectedCrewMember?.name === item.name;
  };

  const getPlaceholderText = () => {
    return "Filter crew members...";
  };

  const getAriaLabel = () => {
    return "Crew members list";
  };

  const renderListItem = (item: CrewMember) => {
    return `${item.name} - ${item.nationality}`;
  };

  const getItemKey = (item: CrewMember) => {
    return item.name;
  };

  return (
    <div className={styles.searchContainer}>
      {/* Header with Close Button */}
      {onClose && (
        <div className={styles.header}>
          <h3>Highlight Crew</h3>
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
            title="Clear crew highlights"
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
                className={`${styles.listItem} ${isItemSelected(item) ? styles.selected : ""} ${styles.crewItem}`}
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
          <div className={styles.noResults}>No crew members found</div>
        )}
      </div>
    </div>
  );
};

export default HighlightCrew;

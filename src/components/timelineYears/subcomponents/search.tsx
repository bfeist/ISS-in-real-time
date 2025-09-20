import React, { useState, useEffect, FunctionComponent, useMemo } from "react";
import styles from "./search.module.css";
import { useStateSearch } from "store/hooks/useStateSearch";
import { useGeneralExpeditionInfo, useGeneralCrewArrDep } from "api/useGeneralData";
import IconButton from "../../common/iconButton";
import { faTimes } from "@fortawesome/free-solid-svg-icons";

type TabType = "crew" | "expedition";

interface SearchProps {
  onClose?: () => void;
}

const Search: FunctionComponent<SearchProps> = ({ onClose }) => {
  const { data: expeditionInfo } = useGeneralExpeditionInfo();
  const { data: crewArrDep } = useGeneralCrewArrDep();
  const {
    selectedExpedition,
    setSelectedExpedition,
    selectedCrewMember,
    setSelectedCrewMember,
    clearAllSearchHighlights,
  } = useStateSearch();

  const [activeTab, setActiveTab] = useState<TabType>("crew");
  const [searchTerm, setSearchTerm] = useState("");

  // Generate expedition list for display
  const expeditions: ExpeditionInfo[] = useMemo(() => {
    if (!expeditionInfo || expeditionInfo.length === 0) {
      return [];
    }
    // Sort expeditions by expedition number in descending order (most recent first)
    return expeditionInfo.slice().sort((a, b) => b.expedition - a.expedition);
  }, [expeditionInfo]);

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

  // Filter logic based on active tab
  const filteredItems = useMemo(() => {
    if (activeTab === "crew") {
      return crewMembers.filter((member) =>
        member.name?.toLowerCase().includes(searchTerm?.toLowerCase())
      );
    } else {
      return expeditions.filter((expedition) => {
        const searchLower = searchTerm.toLowerCase();
        return (
          expedition.expedition.toString().includes(searchTerm) ||
          expedition.expeditionBlurb?.toLowerCase().includes(searchLower)
        );
      });
    }
  }, [activeTab, searchTerm, crewMembers, expeditions]);

  // Reset search when switching tabs
  useEffect(() => {
    setSearchTerm("");
  }, [activeTab]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
  };

  const handleClearAll = () => {
    setSearchTerm("");
    clearAllSearchHighlights();
    onClose?.();
  };

  const hasActiveHighlights = selectedCrewMember || selectedExpedition;

  const handleSelectItem = (item: CrewMember | ExpeditionInfo) => {
    if (activeTab === "crew") {
      const member = item as CrewMember;
      // Toggle selection: if the clicked member is already selected, deselect it
      if (selectedCrewMember?.name === member.name) {
        setSelectedCrewMember(null);
      } else {
        setSelectedCrewMember(member);
      }
    } else {
      const expedition = item as ExpeditionInfo;
      // Toggle selection: if the clicked expedition is already selected, deselect it
      if (selectedExpedition?.expedition === expedition.expedition) {
        setSelectedExpedition(null);
      } else {
        setSelectedExpedition(expedition);
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, item: CrewMember | ExpeditionInfo) => {
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

  const isItemSelected = (item: CrewMember | ExpeditionInfo) => {
    if (activeTab === "crew") {
      const member = item as CrewMember;
      return selectedCrewMember?.name === member.name;
    } else {
      const expedition = item as ExpeditionInfo;
      return selectedExpedition?.expedition === expedition.expedition;
    }
  };

  const getPlaceholderText = () => {
    return activeTab === "crew" ? "Filter crew members..." : "Filter expeditions...";
  };

  const getAriaLabel = () => {
    return activeTab === "crew" ? "Crew members list" : "Expeditions list";
  };

  const renderListItem = (item: CrewMember | ExpeditionInfo) => {
    if (activeTab === "crew") {
      const member = item as CrewMember;
      return `${member.name} - ${member.nationality}`;
    } else {
      const expedition = item as ExpeditionInfo;
      return (
        <div className={styles.expeditionNumber}>
          Expedition {expedition.expedition} -{" "}
          <span className={styles.expeditionDate}>
            {formatDateRange(expedition.start, expedition.end)}
          </span>
        </div>
      );
    }
  };

  const getItemKey = (item: CrewMember | ExpeditionInfo) => {
    if (activeTab === "crew") {
      return (item as CrewMember).name;
    } else {
      return (item as ExpeditionInfo).expedition.toString();
    }
  };

  return (
    <div className={styles.searchContainer}>
      {/* Header with Close Button */}
      {onClose && (
        <div className={styles.header}>
          <h3>Search</h3>
          <IconButton
            icon={faTimes}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={styles.closeButton}
            aria-label="Close search"
            style={{ width: "30px", height: "30px" }}
          />
        </div>
      )}

      {/* Tab Navigation */}
      <div className={styles.tabContainer}>
        <button
          className={`${styles.tab} ${activeTab === "crew" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("crew")}
        >
          Crew Members
        </button>
        <button
          className={`${styles.tab} ${activeTab === "expedition" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("expedition")}
        >
          Expeditions
        </button>
        {hasActiveHighlights && (
          <button
            className={styles.clearAllButton}
            onClick={handleClearAll}
            title="Clear all search highlights"
          >
            Clear
          </button>
        )}
      </div>

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
                className={`${styles.listItem} ${isItemSelected(item) ? styles.selected : ""} ${
                  activeTab === "crew" ? styles.crewItem : styles.expeditionItem
                }`}
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
          <div className={styles.noResults}>
            No {activeTab === "crew" ? "crew members" : "expeditions"} found
          </div>
        )}
      </div>
    </div>
  );
};

export default Search;

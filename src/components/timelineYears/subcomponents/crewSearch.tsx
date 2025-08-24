import React, { useState, useEffect, FunctionComponent, useMemo } from "react";
import styles from "./crewSearch.module.css";
import { useStateCrewSelection } from "store/hooks/useStateCrewSelection";
import { useGeneralCrewArrDep } from "api/useGeneralData";

const CrewSearch: FunctionComponent = () => {
  const { data: crewArrDep } = useGeneralCrewArrDep();
  const { selectedCrewMember, setSelectedCrewMember } = useStateCrewSelection();
  // Generate unique crew list for display in the dropdown
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

  const [searchTerm, setSearchTerm] = useState("");
  const [filteredCrew, setFilteredCrew] = useState(crewMembers);

  useEffect(() => {
    // Filter the crew members based on search term - search by name only
    const results = crewMembers.filter((member) =>
      member.name?.toLowerCase().includes(searchTerm?.toLowerCase())
    );
    setFilteredCrew(results);
  }, [searchTerm, crewMembers]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
  };

  const handleSelectCrewMember = (member: (typeof crewMembers)[0]) => {
    // Toggle selection: if the clicked member is already selected, deselect it
    if (selectedCrewMember?.name === member.name) {
      setSelectedCrewMember(null);
    } else {
      setSelectedCrewMember(member);
    }
    // Additional actions when selecting a crew member can be added here
  };

  const handleKeyDown = (event: React.KeyboardEvent, member: (typeof crewMembers)[0]) => {
    // Select crew member when Enter or Space is pressed
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); // Prevent page scroll on space
      handleSelectCrewMember(member);
    }
  };

  return (
    <>
      <div className={styles.searchBox}>
        <div className={styles.searchInputWrapper}>
          <input
            type="text"
            placeholder="Filter crew members..."
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
      <div className={styles.listContainer}>
        {filteredCrew.length > 0 ? (
          <ul className={styles.list} role="listbox" aria-label="Crew members list">
            {filteredCrew.map((member) => (
              <li
                key={member.name}
                className={`${styles.listItem} ${
                  selectedCrewMember?.name === member.name ? styles.selected : ""
                }`}
                onClick={() => handleSelectCrewMember(member)}
                onKeyDown={(e) => handleKeyDown(e, member)}
                tabIndex={0}
                role="option"
                aria-selected={selectedCrewMember?.name === member.name}
              >
                {member.name} - {member.nationality}
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.noResults}>No crew members found</div>
        )}
      </div>
    </>
  );
};

export default CrewSearch;

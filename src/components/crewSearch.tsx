import React, { useState, useEffect, FunctionComponent, useMemo } from "react";
import styles from "./crewSearch.module.css";

const CrewSearch: FunctionComponent<{
  crewArrDep: CrewArrDepItem[];
}> = ({ crewArrDep }) => {
  // Generate unique crew list for display in the dropdown
  const crewMembers = useMemo(() => {
    // Create a map to track unique crew members by name
    const uniqueCrewMap = new Map<string, CrewArrDepItem>();

    // For each crew member, only keep the most recent visit (based on arrival date)
    crewArrDep.forEach((crew) => {
      const existingCrew = uniqueCrewMap.get(crew.name);

      // If this is the first time we're seeing this name, or this visit is more recent
      if (!existingCrew || new Date(crew.arrivalDate) > new Date(existingCrew.arrivalDate)) {
        uniqueCrewMap.set(crew.name, crew);
      }
    });

    // Convert the map back to an array and format for display
    return Array.from(uniqueCrewMap.values())
      .map((crew) => ({
        id: crew.name, // Now we can just use name as ID since each name only appears once
        displayName: `${crew.name} - ${crew.nationality}`,
        data: crew,
      }))
      .sort((a, b) => a.data.name.localeCompare(b.data.name)); // Sort alphabetically by name
  }, [crewArrDep]);

  const [searchTerm, setSearchTerm] = useState("");
  const [filteredCrew, setFilteredCrew] = useState(crewMembers);
  const [selectedCrewMember, setSelectedCrewMember] = useState<{
    id: string;
    displayName: string;
    data: CrewArrDepItem;
  } | null>(null);

  useEffect(() => {
    // Filter the crew members based on search term - search by name only
    const results = crewMembers.filter((member) =>
      member.data.name.toLowerCase().includes(searchTerm.toLowerCase())
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
    if (selectedCrewMember?.id === member.id) {
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

  // Get all visits for the selected crew member
  const selectedCrewVisits = useMemo(() => {
    if (!selectedCrewMember) return [];

    return crewArrDep
      .filter((crew) => crew.name === selectedCrewMember.id)
      .sort((a, b) => new Date(a.arrivalDate).getTime() - new Date(b.arrivalDate).getTime()); // Sort by arrival date, earliest first
  }, [selectedCrewMember, crewArrDep]);

  return (
    <div className={styles.container}>
      <div className={styles.searchBox}>
        <div className={styles.searchInputWrapper}>
          <input
            type="text"
            placeholder="Search crew members..."
            value={searchTerm}
            onChange={handleSearchChange}
            className={styles.searchInput}
          />
          {searchTerm && (
            <button
              className={styles.clearButton}
              onClick={handleClearSearch}
              aria-label="Clear search"
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
                key={member.id}
                className={`${styles.listItem} ${
                  selectedCrewMember?.id === member.id ? styles.selected : ""
                }`}
                onClick={() => handleSelectCrewMember(member)}
                onKeyDown={(e) => handleKeyDown(e, member)}
                tabIndex={0}
                role="option"
                aria-selected={selectedCrewMember?.id === member.id}
              >
                {member.displayName}
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.noResults}>No crew members found</div>
        )}
      </div>
      {selectedCrewMember && (
        <div className={styles.selectedCrewMember}>
          <h3>Selected Crew Member:</h3>
          <div>{selectedCrewMember.displayName}</div>

          <h4>ISS Visits ({selectedCrewVisits.length}):</h4>
          {selectedCrewVisits.map((visit, index) => (
            <div key={`${visit.name}-${visit.arrivalDate}`} className={styles.crewDetails}>
              <h5>Visit {index + 1}</h5>
              <p>Arrival: {new Date(visit.arrivalDate).toLocaleDateString()}</p>
              <p>Arrival Flight: {visit.arrivalFlight}</p>
              <p>Departure: {new Date(visit.departureDate).toLocaleDateString()}</p>
              <p>Departure Flight: {visit.departureFlight}</p>
              <p>Duration: {visit.durationDays} days</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CrewSearch;

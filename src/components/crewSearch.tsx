import React, { useState, useEffect } from "react";
import styles from "./crewSearch.module.css";

// Sample data - replace with your actual data
const crewMembers = [
  "John Smith - Commander",
  "Maria Rodriguez - Flight Engineer",
  "Yuki Tanaka - Science Officer",
  "David Chen - Medical Officer",
  "Sarah Johnson - Communications",
  "Ahmed Hassan - Navigation",
  "Elena Petrov - Systems Specialist",
  "James Wilson - Mission Specialist",
  "Raj Patel - Payload Specialist",
  "Olga Ivanova - Research Scientist",
  "Miguel Sanchez - Robotics Engineer",
  "Emma Clarke - Botanist",
  "Liu Wei - Physicist",
  "Nadia Cherny - Chemist",
  "Oscar Martinez - Geologist",
  "Aisha Kwame - Astronomer",
  "Thomas Mueller - Meteorologist",
  "Sophia Lee - Computer Specialist",
  "Carlos Mendez - Structural Engineer",
  "Fatima Al-Farsi - Biologist",
];

const CrewSearch: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredCrew, setFilteredCrew] = useState(crewMembers);
  const [selectedCrewMember, setSelectedCrewMember] = useState<string | null>(null);

  useEffect(() => {
    // Filter the crew members based on search term
    const results = crewMembers.filter((member) =>
      member.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredCrew(results);
  }, [searchTerm]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
  };

  const handleSelectCrewMember = (member: string) => {
    // Toggle selection: if the clicked member is already selected, deselect it
    if (selectedCrewMember === member) {
      setSelectedCrewMember(null);
    } else {
      setSelectedCrewMember(member);
    }
    // Additional actions when selecting a crew member can be added here
  };

  const handleKeyDown = (event: React.KeyboardEvent, member: string) => {
    // Select crew member when Enter or Space is pressed
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); // Prevent page scroll on space
      handleSelectCrewMember(member);
    }
  };

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
            {filteredCrew.map((member, index) => (
              <li
                key={index}
                className={`${styles.listItem} ${
                  selectedCrewMember === member ? styles.selected : ""
                }`}
                onClick={() => handleSelectCrewMember(member)}
                onKeyDown={(e) => handleKeyDown(e, member)}
                tabIndex={0}
                role="option"
                aria-selected={selectedCrewMember === member}
              >
                {member}
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
          <div>{selectedCrewMember}</div>
        </div>
      )}
    </div>
  );
};

export default CrewSearch;

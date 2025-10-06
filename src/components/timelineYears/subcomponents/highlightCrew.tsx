import React, { FunctionComponent, useMemo } from "react";
import styles from "./highlightCrew.module.css";
import { useStateSearch } from "store/hooks/useStateSearch";
import { useGeneralCrewArrDep } from "api/useGeneralData";
import { getCrewNormalizedName } from "utils/crew";
import HighlightType, { HighlightTypeConfig } from "./highlightType";

interface HighlightCrewProps {}

const HighlightCrew: FunctionComponent<HighlightCrewProps> = () => {
  const { data: crewArrDep } = useGeneralCrewArrDep();
  const { selectedCrewMember, setSelectedCrewMember } = useStateSearch();

  // Generate unique crew list for display
  // Use normalized names to deduplicate crew members across multiple stays
  // (same person may have different name formats like "Frank L. Culbertson Jr." vs "Frank Culbertson")
  const crewMembers: CrewMember[] = useMemo(() => {
    if (!crewArrDep || crewArrDep.length === 0) {
      return [];
    }
    // Create a map to track unique crew members by normalized name
    const uniqueCrewMap = new Map<string, CrewArrDepItem>();

    // For each crew member, only keep the most recent visit (based on arrival date)
    crewArrDep.forEach((crew) => {
      const normalizedName = getCrewNormalizedName(crew);
      const existingCrew = uniqueCrewMap.get(normalizedName);

      // If this is the first time we're seeing this name, or this visit is more recent
      if (!existingCrew || new Date(crew.arrivalDate) > new Date(existingCrew.arrivalDate)) {
        uniqueCrewMap.set(normalizedName, crew);
      }
    });

    // Convert the map back to an array and format for display
    return Array.from(uniqueCrewMap.values())
      .map((crew) => ({
        name: getCrewNormalizedName(crew),
        nationality: crew.nationality,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically by name
  }, [crewArrDep]);

  // Configuration for the generic HighlightType component
  const config: HighlightTypeConfig<CrewMember> = {
    items: crewMembers,
    selectedItem: selectedCrewMember,
    setSelectedItem: setSelectedCrewMember,
    placeholder: "Filter crew members...",
    ariaLabel: "Crew members list",
    clearAllTitle: "Clear crew highlights",
    itemClassName: "crewItem",
    getItemKey: (item) => item.name,
    renderItem: (item) => (
      <div className={styles.crewName}>
        {item.name} - <span className={styles.crewNationality}>{item.nationality}</span>
      </div>
    ),
    filterItem: (item, searchTerm) => item.name?.toLowerCase().includes(searchTerm?.toLowerCase()),
    isItemEqual: (item1, item2) => item1?.name === item2.name,
  };

  return <HighlightType config={config} />;
};

// Dummy references to satisfy CSS modules linter for classes used dynamically by HighlightType
const _unusedCrewItem = styles.crewItem;
const _unusedSelected = styles.selected;

export default HighlightCrew;

import React, { FunctionComponent, useMemo } from "react";
import { useStateSearch } from "store/hooks/useStateSearch";
import { useGeneralCrewArrDep } from "api/useGeneralData";
import HighlightType, { HighlightTypeConfig } from "./highlightType";

interface HighlightCrewProps {}

const HighlightCrew: FunctionComponent<HighlightCrewProps> = () => {
  const { data: crewArrDep } = useGeneralCrewArrDep();
  const { selectedCrewMember, setSelectedCrewMember } = useStateSearch();

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
    renderItem: (item) => `${item.name} - ${item.nationality}`,
    filterItem: (item, searchTerm) => item.name?.toLowerCase().includes(searchTerm?.toLowerCase()),
    isItemEqual: (item1, item2) => item1?.name === item2.name,
  };

  return <HighlightType config={config} />;
};

export default HighlightCrew;

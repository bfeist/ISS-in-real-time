import React, { FunctionComponent, useMemo } from "react";
import { useGeneralCrewArrDep } from "api/useGeneralData";
import { getCrewMembersOnboardByDate } from "utils/onboard";
import { flagUrlByCountryName } from "utils/countries";
import styles from "./crewOnboardSection.module.css";

interface CrewOnboardSectionProps {
  hoveredDate: string | null;
}

const CrewOnboardSection: FunctionComponent<CrewOnboardSectionProps> = ({ hoveredDate }) => {
  const { data: crewArrDep } = useGeneralCrewArrDep();

  const crewOnboardList = useMemo(() => {
    if (!hoveredDate || !crewArrDep) return [];
    return getCrewMembersOnboardByDate({
      crewArrDep,
      dateStr: hoveredDate,
    });
  }, [hoveredDate, crewArrDep]);

  return (
    <div className={styles.columnContent}>
      {crewOnboardList.length > 0 ? (
        crewOnboardList.map((crewMember) => (
          <div
            key={`${crewMember.arrivalDate}_${crewMember.name_first}_${crewMember.name_last}`}
            className={styles.crewItem}
          >
            <img
              className={styles.flag}
              src={flagUrlByCountryName[crewMember.nationality]}
              alt={crewMember.nationality}
            />
            <span className={styles.crewName}>
              {crewMember.name_first} {crewMember.name_last}
            </span>
          </div>
        ))
      ) : (
        <div className={styles.noData}>No crew onboard</div>
      )}
    </div>
  );
};

export default CrewOnboardSection;

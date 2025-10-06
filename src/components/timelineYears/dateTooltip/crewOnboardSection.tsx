import React, { FunctionComponent, useMemo } from "react";
import { useGeneralCrewArrDep } from "api/useGeneralData";
import { getCrewMembersOnboardByDate } from "utils/onboard";
import { flagUrlByCountryName } from "utils/countries";
import { getCrewFullName, getCrewStayKey } from "utils/crew";
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
    <div className={styles.sectionBody}>
      {crewOnboardList.length > 0 ? (
        crewOnboardList.map((crewMember) => (
          <div key={getCrewStayKey(crewMember)} className={styles.crewItem}>
            <img
              className={styles.flag}
              src={flagUrlByCountryName[crewMember.nationality]}
              alt={crewMember.nationality}
            />
            <span className={styles.crewName}>{getCrewFullName(crewMember)}</span>
          </div>
        ))
      ) : (
        <div className={styles.noData}>No crew onboard</div>
      )}
    </div>
  );
};

export default CrewOnboardSection;

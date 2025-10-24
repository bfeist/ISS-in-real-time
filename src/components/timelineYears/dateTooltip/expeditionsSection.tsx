import React, { FunctionComponent, useMemo } from "react";
import { useGeneralExpeditionInfo } from "api/useGeneralData";
import styles from "./expeditionsSection.module.css";

interface ExpeditionsSectionProps {
  hoveredDate: string | null;
}

const ExpeditionsSection: FunctionComponent<ExpeditionsSectionProps> = ({ hoveredDate }) => {
  const { data: expeditionInfo } = useGeneralExpeditionInfo();

  const expeditionsOnHoveredDate = useMemo(() => {
    if (!hoveredDate || !expeditionInfo) return [];
    return expeditionInfo.filter(
      (expedition: ExpeditionInfo) =>
        expedition.start <= hoveredDate && expedition.end >= hoveredDate
    );
  }, [hoveredDate, expeditionInfo]);

  return (
    <div className={styles.sectionBody}>
      {expeditionsOnHoveredDate.length > 0 ? (
        expeditionsOnHoveredDate.map((expedition: ExpeditionInfo) => (
          <div key={expedition.expedition} className={styles.expeditionItem}>
            {`Expedition ${expedition.expedition}`}
          </div>
        ))
      ) : (
        <div className={styles.noData}>No active expeditions</div>
      )}
    </div>
  );
};

export default ExpeditionsSection;

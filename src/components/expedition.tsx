import { FunctionComponent } from "react";
import styles from "./expedition.module.css";
import { useStateSelectedDate } from "store";
import { useGeneralExpeditionInfo } from "api/useGeneralData";

const Expeditions: FunctionComponent = () => {
  const { selectedDate } = useStateSelectedDate();
  const { data: expeditionInfo = [], isLoading } = useGeneralExpeditionInfo();

  const expeditions = expeditionInfo.filter(
    (exp: ExpeditionInfo) =>
      exp.start <= selectedDate && (exp.end === null || exp.end >= selectedDate)
  );

  if (isLoading) {
    return <div>Loading expeditions...</div>;
  }

  return (
    <div className={styles.expeditions}>
      {expeditions.map((expedition) => (
        <div key={expedition.expedition} className={styles.expedition}>
          <div className={styles.expeditionHeader}>
            <img
              className={styles.patchImg}
              src={expedition.patchUrl}
              alt={expedition.expedition.toString()}
            />
            <div className={styles.expeditionTitle}>Expedition {expedition.expedition}</div>
          </div>
          <div className={styles.expeditionContent}>
            <div className={styles.expeditionBlurb}>{expedition.expeditionBlurb}</div>
            <div className={styles.expeditionDates}>
              {new Date(expedition.start).toISOString().split("T")[0]} -{" "}
              {expedition.end === null
                ? "Actve"
                : new Date(expedition.end).toISOString().split("T")[0]}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Expeditions;

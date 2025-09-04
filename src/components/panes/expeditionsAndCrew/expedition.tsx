import { FunctionComponent } from "react";
import styles from "./expedition.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useGeneralExpeditionInfo } from "api/useGeneralData";

const Expeditions: FunctionComponent = () => {
  const { selectedDate } = useStateClock();
  const { data: expeditionInfo = [], isLoading } = useGeneralExpeditionInfo();

  const expeditions = expeditionInfo.filter(
    (exp: ExpeditionInfo) =>
      exp.start <= selectedDate && (exp.end === null || exp.end >= selectedDate)
  );

  if (isLoading) {
    return <div>Loading expeditions...</div>;
  }

  const animationDuration = 8; // seconds per expedition
  const totalCycleDuration = expeditions.length * animationDuration;

  const keyframes = expeditions
    .map((exp, index) => {
      const singleItemDurationPercent = (animationDuration / totalCycleDuration) * 100;
      const startTime = index * singleItemDurationPercent;
      const endTime = (index + 1) * singleItemDurationPercent;

      // A small percentage for fade in/out
      const fadePercent = 5;

      return `
      @keyframes expedition-fade-${index} {
        0% { opacity: 0; }
        ${startTime}% { opacity: 0; }
        ${startTime + fadePercent}% { opacity: 1; }
        ${endTime - fadePercent}% { opacity: 1; }
        ${endTime}% { opacity: 0; }
        100% { opacity: 0; }
      }
    `;
    })
    .join("\n");

  const renderExpedition = (expedition: ExpeditionInfo) => (
    <>
      <div className={styles.expeditionPatchContainer}>
        <img
          className={styles.patchImg}
          src={expedition.patchUrl}
          alt={expedition.expedition.toString()}
        />
      </div>
      <div className={styles.expeditionContent}>
        <div className={styles.expeditionTitle}>Expedition {expedition.expedition}</div>
        <div className={styles.expeditionBlurb}>{expedition.expeditionBlurb}</div>
        <div className={styles.expeditionDates}>
          {new Date(expedition.start).toISOString().split("T")[0]} -{" "}
          {expedition.end === null
            ? "Active"
            : new Date(expedition.end).toISOString().split("T")[0]}
        </div>
      </div>
    </>
  );

  return (
    <>
      {expeditions.length > 1 && <style>{keyframes}</style>}
      <div className={styles.expeditionsContainer}>
        <div className={styles.expeditionSideText}>
          <span className={styles.expeditionSideTextInner}>
            Active Expedition{expeditions.length > 1 ? "s" : ""}
          </span>
        </div>
        {expeditions.length > 1 ? (
          <>
            {/* Placeholder to maintain container height */}
            <div className={`${styles.expedition} ${styles.expeditionPlaceholder}`}>
              {renderExpedition(expeditions[0])}
            </div>
            {/* Cycling expeditions */}
            {expeditions.map((expedition, index) => (
              <div
                key={expedition.expedition}
                className={`${styles.expedition} ${styles.expeditionCycling}`}
                style={{
                  animation: `expedition-fade-${index} ${totalCycleDuration}s infinite`,
                }}
              >
                {renderExpedition(expedition)}
              </div>
            ))}
          </>
        ) : (
          <div className={styles.expedition}>
            {expeditions.map((expedition) => renderExpedition(expedition))}
          </div>
        )}
      </div>
    </>
  );
};

export default Expeditions;

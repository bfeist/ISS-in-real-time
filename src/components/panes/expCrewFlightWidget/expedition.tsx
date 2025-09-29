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
        0% { opacity: 0; visibility: hidden; }
        ${startTime}% { opacity: 0; visibility: hidden; }
        ${startTime + fadePercent}% { opacity: 1; visibility: visible; }
        ${endTime - fadePercent}% { opacity: 1; visibility: visible; }
        ${endTime}% { opacity: 0; visibility: hidden; }
        100% { opacity: 0; visibility: hidden; }
      }
    `;
    })
    .join("\n");

  const renderExpedition = (expedition: ExpeditionInfo) => {
    const expeditionUrl = `https://www.nasa.gov/mission/expedition-${expedition.expedition}`;

    return (
      <a
        className={styles.expeditionLink}
        href={expeditionUrl}
        target="_blank"
        rel="noopener noreferrer"
        key={expedition.expedition}
      >
        <div className={styles.expeditionTitle}>Expedition {expedition.expedition}</div>
        <div className={styles.expeditionBody}>
          <img
            className={styles.patchImg}
            src={expedition.patchUrl}
            alt={expedition.expedition.toString()}
          />
          <div className={styles.expeditionBlurb}>
            <p>{expedition.expeditionBlurb}</p>
          </div>
        </div>
      </a>
    );
  };

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

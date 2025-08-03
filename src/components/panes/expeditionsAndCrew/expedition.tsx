import { FunctionComponent } from "react";
import styles from "./expedition.module.css";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
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

  const renderExpedition = (expedition: ExpeditionInfo, index?: number) => {
    const isMultiple = expeditions.length > 1;

    const expeditionClasses = isMultiple
      ? `${styles.expedition} ${styles.expeditionCycling}`
      : styles.expedition;

    const expeditionStyle =
      isMultiple && index !== undefined
        ? {
            animation: `expedition-fade-${index} ${totalCycleDuration}s infinite`,
          }
        : {};

    return (
      <div key={expedition.expedition} className={expeditionClasses} style={expeditionStyle}>
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
              ? "Active"
              : new Date(expedition.end).toISOString().split("T")[0]}
          </div>
        </div>
      </div>
    );
  };

  const containerContent =
    expeditions.length > 1
      ? expeditions.map((expedition, index) => renderExpedition(expedition, index))
      : expeditions.map((expedition) => renderExpedition(expedition));

  return (
    <div className={styles.expeditions}>
      {expeditions.length > 1 ? (
        <>
          <style>{keyframes}</style>
          <div className={styles.expeditionsContainer}>
            {/* Placeholder to maintain container height */}
            <div className={`${styles.expedition} ${styles.expeditionPlaceholder}`}>
              <div className={styles.expeditionHeader}>
                <img className={styles.patchImg} src={expeditions[0].patchUrl} alt="" />
                <div className={styles.expeditionTitle}>Expedition {expeditions[0].expedition}</div>
              </div>
              <div className={styles.expeditionContent}>
                <div className={styles.expeditionBlurb}>{expeditions[0].expeditionBlurb}</div>
                <div className={styles.expeditionDates}>
                  {new Date(expeditions[0].start).toISOString().split("T")[0]} -{" "}
                  {expeditions[0].end === null
                    ? "Active"
                    : new Date(expeditions[0].end).toISOString().split("T")[0]}
                </div>
              </div>
            </div>
            {containerContent}
          </div>
        </>
      ) : (
        containerContent
      )}
    </div>
  );
};

export default Expeditions;

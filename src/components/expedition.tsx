import { FunctionComponent } from "react";
import styles from "./expedition.module.css";

const Expeditions: FunctionComponent<{
  expeditions: ExpeditionInfo[];
}> = ({ expeditions }) => {
  return (
    <div className={styles.expeditions}>
      {expeditions.map((expedition) => (
        <div key={expedition.expedition} className={styles.expedition}>
          <img
            className={styles.patchImg}
            src={expedition.patchUrl}
            alt={expedition.expedition.toString()}
          />
          <div className={styles.expeditionRight}>
            <div className={styles.expeditionTitle}>Expedition {expedition.expedition}</div>
            <div className={styles.expeditionBlurb}>{expedition.expeditionBlurb}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Expeditions;

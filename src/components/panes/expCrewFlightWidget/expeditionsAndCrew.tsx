import { FunctionComponent } from "react";
import styles from "./expeditionsAndCrew.module.css";
import Expeditions from "./expedition";
import CrewOnboard from "./crewOnboard";

const ExpeditionAndCrewOnboard: FunctionComponent = () => {
  return (
    <div className={styles.expeditionsAndCrewOnboard}>
      <div className={styles.expeditions}>
        <Expeditions />
      </div>
      <div className={styles.crewOnboard}>
        <CrewOnboard />
      </div>
    </div>
  );
};

export default ExpeditionAndCrewOnboard;

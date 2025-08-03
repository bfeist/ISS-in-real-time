import { FunctionComponent } from "react";
import styles from "./expeditionsAndCrew.module.css";
import Expeditions from "./expedition";
import CrewOnboard from "./crewOnboard";

const ExpeditionAndCrewOnboard: FunctionComponent = () => {
  return (
    <div className={styles.expeditionsAndCrewOnboard}>
      <Expeditions />
      <CrewOnboard />
    </div>
  );
};

export default ExpeditionAndCrewOnboard;

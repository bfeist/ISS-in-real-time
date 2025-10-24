import { FunctionComponent } from "react";
import styles from "./widget.module.css";
import ExpeditionAndCrewOnboard from "./expeditionsAndCrew";
import Flights from "./flights";

const Widget: FunctionComponent = () => {
  return (
    <div className={styles.widgetContainer}>
      <div className={styles.scrollableContent}>
        <div className={styles.twoColumnLayout}>
          <div className={styles.leftColumn}>
            <ExpeditionAndCrewOnboard />
          </div>
          <div className={styles.rightColumn}>
            <Flights />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Widget;

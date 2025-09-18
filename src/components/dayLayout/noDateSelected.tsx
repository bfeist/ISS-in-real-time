import { FunctionComponent, JSX, useState } from "react";
import { faChartBar } from "@fortawesome/free-solid-svg-icons";
import IconButton from "../common/iconButton";
import StatsModal from "./statsModal";
import styles from "./noDateSelected.module.css";

const NoDateSelected: FunctionComponent = (): JSX.Element => {
  const [showStats, setShowStats] = useState(false);

  return (
    <div className={styles.container}>
      <IconButton
        icon={faChartBar}
        label="View Data Stats"
        onClick={() => setShowStats(true)}
        className={styles.statsButton}
      />
      <StatsModal isOpen={showStats} onClose={() => setShowStats(false)} />
    </div>
  );
};

export default NoDateSelected;

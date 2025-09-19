import { FunctionComponent, JSX, useState } from "react";
import { faChartBar } from "@fortawesome/free-solid-svg-icons";
import IconButton from "../common/iconButton";
import StatsModal from "./statsModal";
import DayCounter from "./dayCounter";
import styles from "./noDateSelected.module.css";

const NoDateSelected: FunctionComponent = (): JSX.Element => {
  const [showStats, setShowStats] = useState(false);

  return (
    <div className={styles.container}>
      <div className={styles.pageContent}>
        <h2>Re-live every day of the past 25 years onboard the ISS</h2>
        <p>
          November 3, 2025 marks 25 years of sustained human presence onboard the International
          Space Station
        </p>
        <DayCounter />
        <p>
          This multimedia project contains all publicly available data from every day on the ISS. It
          consists entirely of original historical mission material.
        </p>
        <p>Click any date on the timeline to get started.</p>
      </div>
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

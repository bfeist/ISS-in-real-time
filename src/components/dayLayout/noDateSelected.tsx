import { FunctionComponent, JSX, useState } from "react";
import { faChartBar } from "@fortawesome/free-solid-svg-icons";
import IconButton from "../common/iconButton";
import StatsModal from "./statsModal";
import DayCounter from "./dayCounter";
import styles from "./noDateSelected.module.css";
import About from "components/article/about";

const NoDateSelected: FunctionComponent = (): JSX.Element => {
  const [showStats, setShowStats] = useState(false);

  return (
    <div className={styles.page}>
      <div className={styles.leftColumn}>
        <div className={styles.container}>
          <div className={styles.pageContent}>
            <h2>Re-live every day of the past 25 years onboard the ISS</h2>
            <p>
              November 2, 2025 at 10:23 UTC marks 25 years of sustained human presence onboard the
              International Space Station
            </p>
            <DayCounter />
            <p>
              This multimedia project contains all publicly available data from every day on the
              ISS. It consists entirely of original historical mission material.
            </p>
            <p>Select any date on the years timeline to get started.</p>
          </div>
          <IconButton
            icon={faChartBar}
            label="View Data Stats"
            onClick={() => setShowStats(true)}
            className={styles.statsButton}
          />
          <StatsModal isOpen={showStats} onClose={() => setShowStats(false)} />
        </div>
      </div>
      <div className={styles.rightColumn}>
        <About />
      </div>
    </div>
  );
};

export default NoDateSelected;

import { FunctionComponent, useState } from "react";
import styles from "./header.module.css";
import { useStateToggle } from "../../store/hooks/useStateToggle";
import ShareButton from "components/header/share";
import { useStateClock } from "store/hooks/useStateClock";
import ClockInterval from "components/panes/clockInterval";
import IconButton from "components/common/iconButton";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";

const Header: FunctionComponent = () => {
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();
  const { selectedDate } = useStateClock();

  const [appSeconds, setAppSeconds] = useState(0);

  return (
    <>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <div
        className={styles.header}
        onClick={() => setShowTimelineYears(!showTimelineYears)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setShowTimelineYears(!showTimelineYears);
            e.preventDefault();
          }
        }}
      >
        <div className={styles.left}>
          <div className={styles.titleContainer}>
            <img src="/images/header/ISS_logo.png" alt="ISS Logo" className={styles.logo} />
            <div className={styles.title}>ISS in Real Time</div>
            <div className={styles.blurb}>
              Explore 25 years onboard the International Space Station
            </div>
          </div>
        </div>
        <div className={styles.right}>
          <div className={styles.rightButtons}>
            <IconButton
              icon={faInfoCircle}
              label="About ISS in Real Time"
              style={{ width: "170px", fontSize: "0.7rem" }}
              onClick={(e) => {
                window.open("https://benfeist.com", "_blank");
                e.stopPropagation();
              }}
            />
            <ShareButton selectedDate={selectedDate} appSeconds={appSeconds} />
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;

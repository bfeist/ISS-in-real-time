import { FunctionComponent } from "react";
import styles from "./header.module.css";
import { useStateToggle } from "../../store/hooks/useStateToggle";

const Header: FunctionComponent = () => {
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();

  return (
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
      <div className={styles.right}></div>
    </div>
  );
};

export default Header;

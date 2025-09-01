import { FunctionComponent } from "react";
import styles from "./header.module.css";

const Header: FunctionComponent = () => {
  return (
    <div className={styles.header}>
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

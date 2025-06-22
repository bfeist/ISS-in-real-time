import { FunctionComponent, JSX } from "react";
import styles from "./noDateSelected.module.css";

const NoDateSelected: FunctionComponent = (): JSX.Element => {
  return (
    <div className={styles.container}>
      <div className={styles.message}>Please select a date</div>
    </div>
  );
};

export default NoDateSelected;

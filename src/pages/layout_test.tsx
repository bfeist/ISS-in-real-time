import { useNavigate } from "react-router-dom";
import styles from "./layout_test.module.css";
import { FunctionComponent } from "react";

const LayoutTestControls: FunctionComponent = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.layoutTest}>
      <button onClick={() => navigate("/")}>Back</button>
    </div>
  );
};

const LayoutTest: FunctionComponent = () => {
  return (
    <div className={styles.outerWrapper}>
      <LayoutTestControls />
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.headerTop}>Header top</div>
          <div className={styles.headerBottom}>Timeline</div>
        </div>
        <div className={styles.body}>
          <div className={styles.bodyLeft}>
            <div className={styles.bodyLeftTop}>Video</div>
            <div className={styles.bodyLeftBottom}>Details</div>
          </div>
          <div className={styles.bodyCenter}>
            <div className={styles.bodyCenterTop}>Photos</div>
            <div className={styles.bodyCenterBottom}>Globe</div>
          </div>
          <div className={styles.bodyRight}>Transcript</div>
        </div>
      </div>
    </div>
  );
};

export default LayoutTest;

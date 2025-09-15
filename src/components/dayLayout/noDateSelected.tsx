import { FunctionComponent, JSX, useState } from "react";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import IconButton from "../common/iconButton";
import Stats from "../common/stats";
import styles from "./noDateSelected.module.css";

const NoDateSelected: FunctionComponent = (): JSX.Element => {
  const [showStats, setShowStats] = useState(false);

  return (
    <div className={styles.container}>
      <IconButton
        icon={showStats ? faEyeSlash : faEye}
        label={showStats ? "Hide Stats" : "Show Stats"}
        onClick={() => setShowStats(!showStats)}
        style={{ marginBottom: "20px" }}
      />
      {showStats && <Stats />}
    </div>
  );
};

export default NoDateSelected;

import { FunctionComponent } from "react";
import SearchComponent from "../timelineYears/subcomponents/highlightData";
import styles from "./hoverAndSearch.module.css";

const HoverAndSearch: FunctionComponent = () => {
  return (
    <div className={styles.hoverSearchContainer}>
      <SearchComponent />
    </div>
  );
};

export default HoverAndSearch;

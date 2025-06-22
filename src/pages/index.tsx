import styles from "./index.module.css";
import { FunctionComponent, JSX } from "react";
import Layout from "../components/layout/dayLayout";
import TimelineContainer from "../components/yearsTimelineDropdown/timelineContainer";
import { useSelectedDateState } from "../store";

const SliderPage: FunctionComponent = (): JSX.Element => {
  const { selectedDate } = useSelectedDateState();

  return (
    <div className={styles.page}>
      <TimelineContainer />
      {selectedDate && <Layout />}
    </div>
  );
};

export default SliderPage;

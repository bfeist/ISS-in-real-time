import styles from "./index.module.css";
import { FunctionComponent, JSX } from "react";
import Layout from "../components/layout/dayLayout";
import TimelineContainer from "../components/yearsTimelineDropdown/timelineContainer";
import { useStateSelectedDate } from "../store";
import Header from "components/header/header";

const SliderPage: FunctionComponent = (): JSX.Element => {
  const { selectedDate } = useStateSelectedDate();

  return (
    <div className={styles.page}>
      <Header />
      <TimelineContainer />
      {selectedDate ? <Layout /> : <div>Please select a date</div>}
    </div>
  );
};

export default SliderPage;

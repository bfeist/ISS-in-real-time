import styles from "./index.module.css";
import { FunctionComponent, JSX } from "react";
import Layout from "../components/layout/dayLayout";
import TimelineContainer from "../components/yearsTimelineDropdown/timelineContainer";
import { useIndexPageData } from "../hooks";
import { useSelectedDateState } from "../store";

const SliderPage: FunctionComponent = (): JSX.Element => {
  const { data: indexPageData, isLoading, error } = useIndexPageData();
  const { selectedDate } = useSelectedDateState();

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>Error loading data: {error.message}</div>
      </div>
    );
  }

  if (!indexPageData) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>No data available</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TimelineContainer
        dataAvailabilityItems={indexPageData.dataAvailabilityItems}
        indexPageData={indexPageData}
      />
      {selectedDate && (
        <Layout
          dataAvailability={indexPageData.dataAvailabilityItems.find(
            (item) => item.date === selectedDate
          )}
        />
      )}
    </div>
  );
};

export default SliderPage;

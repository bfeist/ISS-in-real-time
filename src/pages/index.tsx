import styles from "./index.module.css";
import { FunctionComponent, JSX, useState, useCallback } from "react";
import { useLoaderData } from "react-router";
import Layout from "../components/layout/dayLayout";
import TimelineContainer from "../components/yearsTimelineDropdown/timelineContainer";

const SliderPage: FunctionComponent = (): JSX.Element => {
  const indexPageData = useLoaderData() as GetDataIndexPageDataResponse;

  const [selectedDate, setSelectedDate] = useState<string>();
  const [selectedDateDataAvailability, setSelectedDateDataAvailability] =
    useState<DataAvailability | null>(null);

  const clickCallback = useCallback(
    ({ clickedDate }: { clickedDate: string | null }) => {
      if (clickedDate) {
        setSelectedDate(clickedDate);

        // Find data availability for this date
        const dataAvailability = indexPageData.dataAvailabilityItems.find(
          (item) => item.date === clickedDate
        );
        setSelectedDateDataAvailability(
          dataAvailability || {
            date: clickedDate,
            comm: false,
            vvComm: false,
            youtube: false,
            eva: false,
            blog: false,
            activitySummary: false,
            earthPhotography: false,
          }
        );
      }
    },
    [indexPageData.dataAvailabilityItems]
  );

  return (
    <div className={styles.page}>
      <TimelineContainer
        dataAvailabilityItems={indexPageData.dataAvailabilityItems}
        clickCallback={clickCallback}
        indexPageData={indexPageData}
        selectedDate={selectedDate}
      />
      {selectedDate && selectedDateDataAvailability && (
        <Layout
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          dataAvailability={selectedDateDataAvailability}
        />
      )}
    </div>
  );
};

export default SliderPage;

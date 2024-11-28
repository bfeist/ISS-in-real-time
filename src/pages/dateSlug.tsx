import { useLoaderData, useParams } from "react-router-dom";
import Images from "components/images";
import styles from "./dateSlug.module.css";
import Transcript from "components/transcript";

const DatePage = (): JSX.Element => {
  const { date } = useParams();
  const { transcriptItems, imageItems } = useLoaderData() as GetDatePageDataResponse;

  return (
    <div className={styles.page}>
      <div className={styles.header}>Date: {date}</div>
      <div className={styles.upper}>
        <div className={styles.videoContainer}></div>
        <div className={styles.mapContainer}></div>
      </div>

      <div className={styles.lower}>
        <div className={styles.transcriptContainer}>
          <Transcript transcriptItems={transcriptItems} viewDate={date} />
        </div>
        <Images imageItems={imageItems} />
      </div>
    </div>
  );
};

export default DatePage;

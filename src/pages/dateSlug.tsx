import { useLoaderData, useParams } from "react-router-dom";
import Images from "components/images";
import styles from "./dateSlug.module.css";
import Transcript from "components/transcript";
import Map from "components/map";

const DatePage = (): JSX.Element => {
  const { date } = useParams();
  const { transcriptItems, imageItems, ephemeraItems } = useLoaderData() as GetDatePageDataResponse;

  return (
    <div className={styles.page}>
      <div className={styles.header}>Date: {date}</div>
      <div className={styles.upper}>
        <div className={styles.videoContainer}></div>
        <div className={styles.mapContainer}>
          <Map ephemeraItems={ephemeraItems} viewDate={date} />
        </div>
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

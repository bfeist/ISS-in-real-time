import { useLoaderData, useParams } from "react-router-dom";
import Images from "components/images";
import styles from "./index.module.css";
import Transcript from "components/transcript";

const DatePage = (): JSX.Element => {
  const { date } = useParams();
  const { transcriptItems, imageItems } = useLoaderData() as GetDatePageDataResponse;

  return (
    <div className={styles.page}>
      <div className={styles.header}>Date: {date}</div>
      <div className={styles.body}>
        <Transcript transcriptItems={transcriptItems} viewDate={date} />
        <Images imageItems={imageItems} />
      </div>
    </div>
  );
};

export default DatePage;

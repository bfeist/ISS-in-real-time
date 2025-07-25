import styles from "./index.module.css";
import { FunctionComponent, JSX, useEffect } from "react";
import { useParams } from "react-router-dom";
import Layout from "../components/layout/dayLayout";
import TimelineContainer from "../components/timelineYears/timelineYearsContainer";
import { useStateSelectedDate } from "../store/hooks/useStateSelectedDate";
import { useStateClock } from "../store/hooks/useStateClock";
import Header from "components/header/header";
import NoDateSelected from "../components/layout/noDateSelected";
import { parseDateTimeSlug } from "../utils/params";
import { appSecondsFromTimeStr } from "../utils/time";

const SliderPage: FunctionComponent = (): JSX.Element => {
  const { dateTimeSlug } = useParams();
  const { selectedDate, setSelectedDate } = useStateSelectedDate();
  const { setClock } = useStateClock();

  // Handle slug parameter to set date and time in Zustand state
  useEffect(() => {
    if (dateTimeSlug) {
      const parsed = parseDateTimeSlug(dateTimeSlug);
      if (parsed) {
        setSelectedDate(parsed.date);
        setClock(appSecondsFromTimeStr(parsed.time));
      }
    }
  }, [dateTimeSlug, setSelectedDate, setClock]);

  return (
    <div className={styles.page}>
      <Header />
      <TimelineContainer />
      {selectedDate ? <Layout /> : <NoDateSelected />}
    </div>
  );
};

export default SliderPage;

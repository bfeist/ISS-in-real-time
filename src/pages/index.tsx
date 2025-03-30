import styles from "./index.module.css";
import { useLoaderData, useNavigate } from "react-router-dom";
import { FunctionComponent, JSX, useEffect, useState } from "react";

type TotalsObject = {
  comm: number;
  vvComm: number;
  youtube: number;
  eva: number;
  blog: number;
  activitySummary: number;
  earthPhotography: number;
};

const Home = (): JSX.Element => {
  const dataAvailabilityItems = useLoaderData() as DataAvailability[];
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Date>();

  useEffect(() => {
    if (selected) {
      // open the selected date at /date/yyyy-mm-dd
      const date = selected.toISOString().split("T")[0];
      navigate(`/date/${date}`);
    }
  }, [selected, navigate]);

  const calculateTotals = (dataAvailabilityItems: DataAvailability[]): TotalsObject => {
    const totalsObject = {
      comm: 0,
      vvComm: 0,
      youtube: 0,
      eva: 0,
      blog: 0,
      activitySummary: 0,
      earthPhotography: 0,
    };
    dataAvailabilityItems.forEach((item) => {
      totalsObject.comm += item.comm ? 1 : 0;
      totalsObject.vvComm += item.vvComm ? 1 : 0;
      totalsObject.youtube += item.youtube ? 1 : 0;
      totalsObject.eva += item.eva ? 1 : 0;
      totalsObject.blog += item.blog ? 1 : 0;
      totalsObject.activitySummary += item.activitySummary ? 1 : 0;
      totalsObject.earthPhotography += item.earthPhotography ? 1 : 0;
    });
    return totalsObject;
  };

  const totalsObject: TotalsObject = calculateTotals(dataAvailabilityItems);

  const startDate = new Date(Date.UTC(2000, 9, 1)); // 2000-10-01
  const endDate = new Date();
  const allYears: number[] = [];

  for (let year = endDate.getUTCFullYear(); year >= startDate.getUTCFullYear(); year--) {
    allYears.push(year);
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageTitle}>Available Dates</div>
      <p>
        <span className={styles.dayYoutube}>Blue</span> means youtube coverage.
        <br />
        <span className={styles.dayEva}>Bold</span> means EVA that day.
        <span className={styles.dayNoComm}>This grey</span> means no comm but has other data like
        blogs, statuses, or earth photography.
        <br />
        <span className={styles.dayNoData}>This grey</span> means no data at all.
      </p>
      <p>
        Day Totals:
        <br /> Comm: {totalsObject.comm} | Visiting Vehicle Comm: {totalsObject.vvComm} | YouTube:{" "}
        {totalsObject.youtube} | EVA: {totalsObject.eva} | Blog: {totalsObject.blog} | Activity
        Summary: {totalsObject.activitySummary} | Earth Photography: {totalsObject.earthPhotography}
      </p>
      <div className={styles.yearsContainer}>
        {allYears.map((year) => {
          const dataItemsThisYear = dataAvailabilityItems.filter(
            (item) => parseInt(item.date.split("-")[0]) === year
          );

          return (
            <YearPicker
              key={year}
              availableDataItemsThisYear={dataItemsThisYear}
              year={year}
              setSelected={setSelected}
            />
          );
        })}
      </div>
    </div>
  );
};

export default Home;

const YearPicker: FunctionComponent<{
  availableDataItemsThisYear: DataAvailability[];
  year: number;
  setSelected: Function;
}> = ({ availableDataItemsThisYear, year, setSelected }) => {
  const availableMonthsThisYear: number[] = [];
  availableDataItemsThisYear.forEach((item) => {
    const month = parseInt(item.date.split("-")[1]);
    if (!availableMonthsThisYear.includes(month)) {
      availableMonthsThisYear.push(month);
    }
  });
  // sort descending
  availableMonthsThisYear.sort((a, b) => b - a);

  return (
    <div className={styles.page}>
      <div className={styles.yearTitle}>{year}</div>
      <div className={styles.yearContainer}>
        {availableMonthsThisYear.map((month) => {
          const availableDataItemsThisMonth: DataAvailability[] = [];
          availableDataItemsThisYear.forEach((item) => {
            if (parseInt(item.date.split("-")[1]) === month) {
              availableDataItemsThisMonth.push(item);
            }
          });
          return (
            <MonthPicker
              availableDataItemsThisMonth={availableDataItemsThisMonth}
              month={month}
              setSelected={setSelected}
            />
          );
        })}
      </div>
    </div>
  );
};

const MonthPicker: FunctionComponent<{
  availableDataItemsThisMonth: DataAvailability[];
  month: number;
  setSelected: Function;
}> = ({ availableDataItemsThisMonth, month, setSelected }) => {
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  };

  const year =
    availableDataItemsThisMonth[0]?.date.split("-")[0] || new Date().getUTCFullYear().toString();
  const daysInMonth = getDaysInMonth(parseInt(year), month);
  const allDays: Date[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(parseInt(year), month - 1, day));
    if (date >= new Date(Date.UTC(2000, 9, 1)) && date <= new Date()) {
      allDays.push(date);
    }
  }

  return (
    <div>
      <div className={styles.monthTitle}>{month}</div>
      <div>
        {allDays.map((date) => {
          const dayItem = availableDataItemsThisMonth.find(
            (item) => item.date === date.toISOString().split("T")[0]
          );

          const evaStyle = dayItem?.eva ? styles.dayEva : "";
          const youtubeStyle = dayItem?.youtube ? styles.dayYoutube : "";
          const noCommStyle =
            dayItem &&
            !dayItem.comm &&
            (dayItem.blog || dayItem.activitySummary || dayItem.earthPhotography)
              ? styles.dayNoComm
              : "";
          const noDataStyle =
            !dayItem ||
            (!dayItem.comm &&
              !dayItem.blog &&
              !dayItem.activitySummary &&
              !dayItem.earthPhotography &&
              !dayItem.eva &&
              !dayItem.youtube &&
              !dayItem.vvComm)
              ? styles.dayNoData
              : "";

          return (
            <div
              key={date.toISOString()}
              className={`${styles.day} ${evaStyle} ${youtubeStyle} ${noCommStyle} ${noDataStyle}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(date)}
              onKeyDown={() => setSelected(date)}
            >
              {date.toISOString().split("T")[0].split("-")[2]}
            </div>
          );
        })}
      </div>
    </div>
  );
};

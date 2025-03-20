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

  const availableYears: number[] = [];
  dataAvailabilityItems.forEach((item) => {
    const year = parseInt(item?.date.split("-")[0]);
    if (!availableYears.includes(year)) {
      availableYears.push(year);
    }
  });
  availableYears.sort((a, b) => b - a);

  return (
    <div className={styles.page}>
      <h1>Available Dates</h1>
      <p>
        <span className={styles.dayYoutube}>Blue</span> means youtube coverage.
        <span className={styles.dayEva}>Bold</span> means EVA that day.
      </p>
      <p>
        <div style={{ marginLeft: "10px" }}>
          Total Days:
          <br /> Comm: {totalsObject.comm} | Visiting Vehicle Comm: {totalsObject.vvComm} | YouTube:{" "}
          {totalsObject.youtube} | EVA: {totalsObject.eva} | Blog: {totalsObject.blog} | Activity
          Summary: {totalsObject.activitySummary} | Earth Photography:{" "}
          {totalsObject.earthPhotography}
        </div>
      </p>
      <div className={styles.yearsContainer}>
        {availableYears.map((year) => {
          const availableDataItemsThisYear: DataAvailability[] = [];
          dataAvailabilityItems.forEach((item) => {
            if (parseInt(item.date.split("-")[0]) === year) {
              availableDataItemsThisYear.push(item);
            }
          });

          return (
            <>
              <YearPicker
                availableDataItemsThisYear={availableDataItemsThisYear}
                year={year}
                setSelected={setSelected}
              />
            </>
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
  const availableDaysThisMonth: Date[] = [];
  availableDataItemsThisMonth.forEach((item) => {
    const parts = item.date.split("-");
    const dateObj: Date = new Date(
      Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    );
    if (!availableDaysThisMonth.includes(dateObj)) {
      availableDaysThisMonth.push(dateObj);
    }
  });

  return (
    <div>
      <div className={styles.monthTitle}>{month}</div>
      <div>
        {availableDaysThisMonth.map((date) => {
          const dayItem = availableDataItemsThisMonth.find(
            (item) => item.date === date.toISOString().split("T")[0]
          );

          const evaStyle = dayItem?.eva ? styles.dayEva : "";
          const youtubeStyle = dayItem?.youtube ? styles.dayYoutube : "";

          return (
            <div
              key={date.toISOString()}
              className={`${styles.day} ${evaStyle} ${youtubeStyle} `}
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

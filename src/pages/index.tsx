import styles from "./index.module.css";
import { useLoaderData, useNavigate } from "react-router-dom";
import { FunctionComponent, JSX, useEffect, useState } from "react";

const Home = (): JSX.Element => {
  const availableDateItems = useLoaderData() as AvailableDate[];
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Date>();

  useEffect(() => {
    if (selected) {
      // open the selected date at /date/yyyy-mm-dd
      const date = selected.toISOString().split("T")[0];
      navigate(`/date/${date}`);
    }
  }, [selected, navigate]);

  const availableYears: number[] = [];
  availableDateItems.forEach((item) => {
    const year = parseInt(item.date.split("-")[0]);
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
      <div className={styles.yearsContainer}>
        {availableYears.map((year) => {
          const availableDateItemsThisYear: AvailableDate[] = [];
          availableDateItems.forEach((item) => {
            if (parseInt(item.date.split("-")[0]) === year) {
              availableDateItemsThisYear.push(item);
            }
          });

          return (
            <>
              <YearPicker
                availableDateItemsThisYear={availableDateItemsThisYear}
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
  availableDateItemsThisYear: AvailableDate[];
  year: number;
  setSelected: Function;
}> = ({ availableDateItemsThisYear, year, setSelected }) => {
  const availableMonthsThisYear: number[] = [];
  availableDateItemsThisYear.forEach((item) => {
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
          const availableDateItemsThisMonth: AvailableDate[] = [];
          availableDateItemsThisYear.forEach((item) => {
            if (parseInt(item.date.split("-")[1]) === month) {
              availableDateItemsThisMonth.push(item);
            }
          });
          return (
            <MonthPicker
              availableDateItemsThisMonth={availableDateItemsThisMonth}
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
  availableDateItemsThisMonth: AvailableDate[];

  month: number;
  setSelected: Function;
}> = ({ availableDateItemsThisMonth, month, setSelected }) => {
  const availableDaysThisMonth: Date[] = [];
  availableDateItemsThisMonth.forEach((item) => {
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
          const dayItem = availableDateItemsThisMonth.find(
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

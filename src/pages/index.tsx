import styles from "./index.module.css";
import { useLoaderData, useNavigate } from "react-router-dom";
import { DayPicker, OnSelectHandler } from "react-day-picker";
import "react-day-picker/style.css";
import { FunctionComponent, useEffect, useState } from "react";

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
      {availableYears.map((year) => {
        const availableDateItemsThisYear: AvailableDate[] = [];
        availableDateItems.forEach((item) => {
          if (parseInt(item.date.split("-")[0]) === year) {
            availableDateItemsThisYear.push(item);
          }
        });

        return (
          <YearPicker
            availableDateItemsThisYear={availableDateItemsThisYear}
            year={year}
            selected={selected}
            setSelected={setSelected}
          />
        );
      })}
    </div>
  );
};

export default Home;

const YearPicker: FunctionComponent<{
  availableDateItemsThisYear: AvailableDate[];
  year: number;
  selected: Date;
  setSelected: OnSelectHandler<Date>;
}> = ({ availableDateItemsThisYear, year, selected, setSelected }) => {
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
      <h2>{year}</h2>
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
              year={year}
              month={month}
              selected={selected}
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
  year: number;
  month: number;
  selected: Date;
  setSelected: OnSelectHandler<Date>;
}> = ({ availableDateItemsThisMonth, year, month, selected, setSelected }) => {
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
    <DayPicker
      numberOfMonths={1}
      month={new Date(year, month - 1)}
      mode="single"
      selected={selected}
      onSelect={setSelected}
      hideNavigation={true}
      // Define modifiers to highlight enabled dates
      modifiers={{
        enabled: availableDaysThisMonth,
      }}
      // Add CSS classes to enabled dates
      modifiersClassNames={{
        enabled: "enabled-date",
      }}
      // Disable all other dates
      disabled={(date) =>
        !availableDaysThisMonth.some(
          (enabledDate) =>
            enabledDate.toISOString().split("T")[0] === date.toISOString().split("T")[0]
        )
      }
    />
  );
};

import styles from "./index_old.module.css";
import { useNavigate } from "react-router-dom";
import { FunctionComponent, JSX, useEffect, useState } from "react";
import { useGeneralDataAvailabilities } from "api/useGeneralData";

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
  // Use individual hooks for better granular control
  const dataAvailabilitiesQuery = useGeneralDataAvailabilities();
  const [propertyToHighlight, setPropertyToHighlight] = useState<string>("");

  const handlePropertyHighlight = (property: string) => {
    setPropertyToHighlight(property);
  };
  if (dataAvailabilitiesQuery.isLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (dataAvailabilitiesQuery.error) {
    return (
      <div className={styles.error}>
        Error loading data: {dataAvailabilitiesQuery.error.message}
      </div>
    );
  }

  if (!dataAvailabilitiesQuery.data || dataAvailabilitiesQuery.data.length === 0) {
    return <div className={styles.error}>No data available</div>;
  }

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

  const totalsObject: TotalsObject = calculateTotals(dataAvailabilitiesQuery.data);

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
        <br />
        <span className={styles.dayComm}>Black</span> means space-to-ground comm coverage.
        <br />
        <span className={styles.dayOtherData}>This grey</span> means no comm but has other data like
        blogs, statuses, or earth photography.
        <br />
        <span className={styles.dayNoData}>This grey</span> means no data at all.
      </p>
      <p>
        Day Totals:
        <br />
        <button
          className={`${styles.totalButton} ${propertyToHighlight === "comm" ? styles.highlightedTotal : ""}`}
          onClick={() => handlePropertyHighlight(propertyToHighlight === "comm" ? "" : "comm")}
        >
          Comm: {totalsObject.comm}
        </button>{" "}
        <button
          className={`${styles.totalButton} ${propertyToHighlight === "vvComm" ? styles.highlightedTotal : ""}`}
          onClick={() => handlePropertyHighlight(propertyToHighlight === "vvComm" ? "" : "vvComm")}
        >
          Visiting Vehicle Comm: {totalsObject.vvComm}
        </button>{" "}
        <button
          className={`${styles.totalButton} ${propertyToHighlight === "youtube" ? styles.highlightedTotal : ""}`}
          onClick={() =>
            handlePropertyHighlight(propertyToHighlight === "youtube" ? "" : "youtube")
          }
        >
          YouTube: {totalsObject.youtube}
        </button>{" "}
        <button
          className={`${styles.totalButton} ${propertyToHighlight === "eva" ? styles.highlightedTotal : ""}`}
          onClick={() => handlePropertyHighlight(propertyToHighlight === "eva" ? "" : "eva")}
        >
          EVA: {totalsObject.eva}
        </button>{" "}
        <button
          className={`${styles.totalButton} ${propertyToHighlight === "blog" ? styles.highlightedTotal : ""}`}
          onClick={() => handlePropertyHighlight(propertyToHighlight === "blog" ? "" : "blog")}
        >
          Blog: {totalsObject.blog}
        </button>{" "}
        <button
          className={`${styles.totalButton} ${propertyToHighlight === "activitySummary" ? styles.highlightedTotal : ""}`}
          onClick={() =>
            handlePropertyHighlight(
              propertyToHighlight === "activitySummary" ? "" : "activitySummary"
            )
          }
        >
          Activity Summary: {totalsObject.activitySummary}
        </button>{" "}
        <button
          className={`${styles.totalButton} ${propertyToHighlight === "earthPhotography" ? styles.highlightedTotal : ""}`}
          onClick={() =>
            handlePropertyHighlight(
              propertyToHighlight === "earthPhotography" ? "" : "earthPhotography"
            )
          }
        >
          Earth Photography: {totalsObject.earthPhotography}
        </button>
      </p>
      <div className={styles.yearsContainer}>
        {allYears.map((year) => {
          const dataItemsThisYear = dataAvailabilitiesQuery.data!.filter(
            (item: DataAvailability) => parseInt(item.date.split("-")[0]) === year
          );

          return (
            <YearPicker
              key={year}
              availableDataItemsThisYear={dataItemsThisYear}
              year={year}
              propertyToHighlight={propertyToHighlight}
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
  propertyToHighlight: string;
}> = ({ availableDataItemsThisYear, year, propertyToHighlight }) => {
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
    <div className={styles.yearPickerContainer}>
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
              key={month}
              availableDataItemsThisMonth={availableDataItemsThisMonth}
              month={month}
              propertyToHighlight={propertyToHighlight}
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
  propertyToHighlight: string;
}> = ({ availableDataItemsThisMonth, month, propertyToHighlight }) => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Date>();
  useEffect(() => {
    if (selected) {
      // open the selected date at /date/yyyy-mm-dd
      const date = selected.toISOString().split("T")[0];
      navigate(`/date/${date}`);
    }
  }, [selected, navigate]);

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  };

  const getTooltipText = (dayItem: DataAvailability | undefined): string => {
    if (!dayItem) return "No data available";
    const available = [];
    if (dayItem.comm) available.push("Space-to-Ground Comm");
    if (dayItem.vvComm) available.push("Visiting Vehicle Comm");
    if (dayItem.youtube) available.push("YouTube Coverage");
    if (dayItem.eva) available.push("EVA");
    if (dayItem.blog) available.push("Blog");
    if (dayItem.activitySummary) available.push("Activity Summary");
    if (dayItem.earthPhotography) available.push("Earth Photography");
    return available.length ? `Available: ${available.join(", ")}` : "No data available";
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

          const commStyle = dayItem?.comm || dayItem?.vvComm ? styles.dayComm : "";
          const evaStyle = dayItem?.eva ? styles.dayEva : "";
          const youtubeStyle = dayItem?.youtube ? styles.dayYoutube : "";
          const otherDataStyle =
            dayItem &&
            !dayItem.comm &&
            (dayItem.blog || dayItem.activitySummary || dayItem.earthPhotography)
              ? styles.dayOtherData
              : "";
          const noDataStyle =
            !dayItem ||
            (!dayItem.comm &&
              !dayItem.blog &&
              !dayItem.activitySummary &&
              !dayItem.earthPhotography &&
              !dayItem.vvComm)
              ? styles.dayNoData
              : "";

          let highlightToday = false;
          if (propertyToHighlight === "comm" && dayItem?.comm) {
            highlightToday = true;
          } else if (propertyToHighlight === "vvComm" && dayItem?.vvComm) {
            highlightToday = true;
          } else if (propertyToHighlight === "activitySummary" && dayItem?.activitySummary) {
            highlightToday = true;
          } else if (propertyToHighlight === "earthPhotography" && dayItem?.earthPhotography) {
            highlightToday = true;
          } else if (propertyToHighlight === "eva" && dayItem?.eva) {
            highlightToday = true;
          } else if (propertyToHighlight === "youtube" && dayItem?.youtube) {
            highlightToday = true;
          } else if (propertyToHighlight === "blog" && dayItem?.blog) {
            highlightToday = true;
          }

          return (
            <div
              key={date.toISOString()}
              className={`${styles.day}  ${commStyle} ${evaStyle} ${youtubeStyle} ${otherDataStyle} ${noDataStyle} ${highlightToday && styles.dayHighlighted}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(date)}
              onKeyDown={() => setSelected(date)}
              title={getTooltipText(dayItem)}
            >
              {date.toISOString().split("T")[0].split("-")[2]}
            </div>
          );
        })}
      </div>
    </div>
  );
};

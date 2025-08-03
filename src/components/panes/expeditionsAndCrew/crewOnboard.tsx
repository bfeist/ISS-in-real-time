import { FunctionComponent, useEffect, useState } from "react";
import styles from "./crewOnboard.module.css"; // ensure this CSS file exists or adjust accordingly
import { ddhhmmssBetweenDateStrings, dateTimeStrFromDateAppSeconds } from "utils/time";
import ClockInterval from "../clockInterval";
import { flagUrlByCountryName } from "utils/countries";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
import { useGeneralCrewArrDep } from "api/useGeneralData";
import { getCrewMembersOnboardByDate } from "utils/onboard";

const CrewOnboard: FunctionComponent = () => {
  const { selectedDate } = useStateSelectedDate();
  const { data: crewArrDep = [], isLoading } = useGeneralCrewArrDep();

  const crewOnboard = getCrewMembersOnboardByDate({ crewArrDep, dateStr: selectedDate || "" });

  const [currentTimeStr, setCurrentTimeStr] = useState("");
  const [appSeconds, setAppSeconds] = useState(0);

  useEffect(() => {
    setCurrentTimeStr(dateTimeStrFromDateAppSeconds({ dateStr: selectedDate || "", appSeconds }));
  }, [selectedDate, appSeconds]);

  if (isLoading) {
    return <div>Loading crew onboard...</div>;
  }

  return (
    <div className={styles.crewOnboard}>
      <ClockInterval setAppSeconds={setAppSeconds} />
      {crewOnboard.map((crewItem) => (
        <div key={`${crewItem.arrivalDate}_${crewItem.name_first}_${crewItem.name_last}`}>
          <div>
            <div className={styles.crewName}>
              <img
                className={styles.flag}
                src={flagUrlByCountryName[crewItem.nationality]}
                alt={crewItem.nationality}
              />
              {crewItem.name_first} {crewItem.name_last}
            </div>
            <div>Onboard: {ddhhmmssBetweenDateStrings(crewItem.arrivalDate, currentTimeStr)}</div>
            <div>
              {crewItem.departureDate !== null && (
                <>
                  Departing in: {ddhhmmssBetweenDateStrings(currentTimeStr, crewItem.departureDate)}
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CrewOnboard;

import { FunctionComponent, useEffect, useState } from "react";
import styles from "./crewOnboard.module.css"; // ensure this CSS file exists or adjust accordingly
import { ddhhmmssBetweenDateStrings, timeStrFromDateAppSeconds } from "utils/time";
import ClockInterval from "./clockInterval";
import { flagUrlByCountryName } from "utils/countries";

const CrewOnboard: FunctionComponent<{
  dateStr: string;
  crewOnboard: CrewArrDepItem[];
}> = ({ dateStr, crewOnboard }) => {
  const [currentTimeStr, setCurrentTimeStr] = useState("");
  const [appSeconds, setAppSeconds] = useState(0);

  useEffect(() => {
    setCurrentTimeStr(timeStrFromDateAppSeconds({ dateStr, appSeconds }));
  }, [dateStr, appSeconds]);

  return (
    <div className={styles.crewOnboard}>
      <ClockInterval setAppSeconds={setAppSeconds} />
      {crewOnboard.map((crewItem) => (
        <div key={`${crewItem.arrivalDate}_${crewItem.name}`}>
          <div>
            <div className={styles.crewName}>
              <img
                className={styles.flag}
                src={flagUrlByCountryName[crewItem.nationality]}
                alt={crewItem.nationality}
              />
              {crewItem.name}
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

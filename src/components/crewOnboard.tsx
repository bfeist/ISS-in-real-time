import { FunctionComponent, useEffect, useState } from "react";
import styles from "./crewOnboard.module.css"; // ensure this CSS file exists or adjust accordingly
import { useClockState } from "context/clockContext";
import { ddhhmmssBetweenDateStrings, timeStrFromDateAppSeconds } from "utils/time";

const CrewOnboard: FunctionComponent<{
  dateStr: string;
  crewOnboard: CrewArrDepItem[];
  nationalityFlags: NationalityFlags;
}> = ({ dateStr, crewOnboard, nationalityFlags }) => {
  const clock = useClockState();

  const [currentTimeStr, setCurrentTimeStr] = useState("");

  useEffect(() => {
    setCurrentTimeStr(timeStrFromDateAppSeconds({ dateStr, appSeconds: clock.appSeconds }));
  }, [clock, dateStr]);

  return (
    <div className={styles.crewOnboard}>
      {crewOnboard.map((crewItem) => (
        <div key={`${crewItem.arrivalDate}_${crewItem.name}`} className={styles.crewMember}>
          <div className={styles.crewInfo}>
            <div className={styles.crewName}>
              <img
                className={styles.flag}
                src={nationalityFlags[crewItem.nationality]}
                alt={crewItem.nationality}
              />
              {crewItem.name}
            </div>
            <div>Onboard: {ddhhmmssBetweenDateStrings(crewItem.arrivalDate, currentTimeStr)}</div>
            <div>
              Departing in: {ddhhmmssBetweenDateStrings(currentTimeStr, crewItem.departureDate)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CrewOnboard;

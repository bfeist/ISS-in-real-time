import { FunctionComponent, useEffect, useState } from "react";
import styles from "./crewOnboard.module.css"; // ensure this CSS file exists or adjust accordingly
import { useClockContext } from "context/clockContext";
import { ddhhmmssBetweenDateStrings, timeStrFromDateAppSeconds } from "utils/time";
import ClockInterval from "./clockInterval";

const CrewOnboard: FunctionComponent<{
  dateStr: string;
  crewOnboard: CrewArrDepItem[];
  nationalityFlags: NationalityFlags;
}> = ({ dateStr, crewOnboard, nationalityFlags }) => {
  const { clock } = useClockContext();

  const [currentTimeStr, setCurrentTimeStr] = useState("");
  const [appSeconds, setAppSeconds] = useState(0);

  useEffect(() => {
    setCurrentTimeStr(timeStrFromDateAppSeconds({ dateStr, appSeconds: appSeconds }));
  }, [clock, dateStr, appSeconds]);

  return (
    <div className={styles.crewOnboard}>
      <ClockInterval setAppSeconds={setAppSeconds} />
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

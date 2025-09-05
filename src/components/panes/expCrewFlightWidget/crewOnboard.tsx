import { FunctionComponent, useEffect, useState } from "react";
import styles from "./crewOnboard.module.css"; // ensure this CSS file exists or adjust accordingly
import { ddhhmmssBetweenDateStrings, dateTimeStrFromDateAppSeconds } from "utils/time";
import ClockInterval from "../clockInterval";
import { flagUrlByCountryName } from "utils/countries";
import { useStateClock } from "store/hooks/useStateClock";
import { useGeneralCrewArrDep } from "api/useGeneralData";
import { getCrewMembersOnboardByDate } from "utils/onboard";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp } from "@fortawesome/free-solid-svg-icons";

const CrewOnboard: FunctionComponent = () => {
  const { selectedDate } = useStateClock();
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
    <div className={styles.crewOnboardContainer}>
      <div className={styles.crewSideText}>
        <span className={styles.crewSideTextInner}>Crew Onboard ({crewOnboard.length})</span>
      </div>
      <div className={styles.crewOnboard}>
        <ClockInterval setAppSeconds={setAppSeconds} />
        {crewOnboard.map((crewItem) => (
          <>
            <div
              key={`${crewItem.arrivalDate}_${crewItem.name_first}_${crewItem.name_last}`}
              className={styles.crewItem}
            >
              <img
                className={styles.flag}
                src={flagUrlByCountryName[crewItem.nationality]}
                alt={crewItem.nationality}
              />
              <div className={styles.crewText}>
                <div className={styles.crewName}>
                  {crewItem.name_first} {crewItem.name_last}
                </div>
              </div>
            </div>
            <div className={styles.timeOnboard}>
              <div>
                <FontAwesomeIcon className={styles.arrowIcon} icon={faArrowUp} />
                {ddhhmmssBetweenDateStrings(crewItem.arrivalDate, currentTimeStr)}
              </div>
              <div>
                {crewItem.departureDate !== null && (
                  <>
                    <FontAwesomeIcon className={styles.arrowIcon} icon={faArrowDown} />
                    {ddhhmmssBetweenDateStrings(currentTimeStr, crewItem.departureDate)}
                  </>
                )}
              </div>
            </div>
          </>
        ))}
      </div>
    </div>
  );
};

export default CrewOnboard;

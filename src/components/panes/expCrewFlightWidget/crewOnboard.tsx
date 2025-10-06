import { FunctionComponent, useState, useMemo } from "react";
import styles from "./crewOnboard.module.css"; // ensure this CSS file exists or adjust accordingly
import { ddhhmmssBetweenDateStrings, dateTimeStrFromDateAppSeconds } from "utils/time";
import ClockInterval from "../clockInterval";
import { flagUrlByCountryName } from "utils/countries";
import { useStateClock } from "store/hooks/useStateClock";
import { useGeneralCrewArrDep } from "api/useGeneralData";
import { getCrewMembersOnboardByDate } from "utils/onboard";
import { getCrewFullName, getCrewStayKey } from "utils/crew";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp } from "@fortawesome/free-solid-svg-icons";

const CrewOnboard: FunctionComponent = () => {
  const { selectedDate } = useStateClock();
  const { data: crewArrDep = [], isLoading } = useGeneralCrewArrDep();

  const [appSeconds, setAppSeconds] = useState(0);

  const currentTimeStr = useMemo(
    () => dateTimeStrFromDateAppSeconds({ dateStr: selectedDate || "", appSeconds }),
    [selectedDate, appSeconds]
  );

  const crewOnboard = useMemo(() => {
    // Update crew onboard based on current time
    // Don't pass appSeconds if it's 0 (initial state) - use day-based comparison
    return getCrewMembersOnboardByDate({
      crewArrDep,
      dateStr: selectedDate || "",
      appSeconds: appSeconds > 0 ? appSeconds : undefined,
    });
  }, [selectedDate, appSeconds, crewArrDep]);

  // Helper function to check if a crew member is currently in space
  const isCurrentlyInSpace = (crewItem: CrewArrDepItem): boolean => {
    return (
      crewItem.departureFlight === "TBD" || new Date(crewItem.departureDate).getFullYear() >= 2099
    );
  };

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
        {crewOnboard.map((crewItem) => {
          const crewFullName = getCrewFullName(crewItem);
          const wikipediaSearchUrl = `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(crewFullName)}`;
          const currentlyInSpace = isCurrentlyInSpace(crewItem);

          return (
            <div key={getCrewStayKey(crewItem)}>
              <div className={styles.crewItem}>
                <div className={styles.flagContainer}>
                  <img
                    className={styles.flag}
                    src={flagUrlByCountryName[crewItem.nationality]}
                    alt={crewItem.nationality}
                  />
                </div>
                <div className={styles.crewText}>
                  <a
                    className={styles.crewName}
                    href={wikipediaSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {crewFullName}
                  </a>
                </div>
              </div>
              <div className={styles.timeOnboard}>
                <div className={styles.arriveDepartTime}>
                  <FontAwesomeIcon className={styles.arrowIcon} icon={faArrowUp} />
                  {ddhhmmssBetweenDateStrings(crewItem.arrivalDate, currentTimeStr)}
                </div>
                <div className={styles.arriveDepartTime}>
                  {currentlyInSpace ? (
                    <>
                      <FontAwesomeIcon className={styles.arrowIcon} icon={faArrowDown} />
                      <span> Landing date TBD</span>
                    </>
                  ) : (
                    crewItem.departureDate !== null && (
                      <>
                        <FontAwesomeIcon className={styles.arrowIcon} icon={faArrowDown} />
                        <span>
                          {ddhhmmssBetweenDateStrings(currentTimeStr, crewItem.departureDate)}
                        </span>
                      </>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CrewOnboard;

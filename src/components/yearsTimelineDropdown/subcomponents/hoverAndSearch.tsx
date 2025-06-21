import { FunctionComponent } from "react";
import CrewSearch from "./crewSearch";
import styles from "./hoverAndSearch.module.css";

const HoverAndSearch: FunctionComponent<{
  hoveredDate: string;
  expeditions: ExpeditionInfo[];
  crewOnboardList: string[];
  flightsDocked: string[];
  supplyFlightsDocked: string[];
  crewArrDep: CrewArrDepItem[];
  selectedCrewMember: CrewMember | null;
  setSelectedCrewMember: (crewMember: CrewMember | null) => void;
}> = ({
  hoveredDate,
  expeditions,
  crewOnboardList,
  flightsDocked,
  supplyFlightsDocked,
  crewArrDep,
  selectedCrewMember,
  setSelectedCrewMember,
}) => {
  return (
    <div className={styles.dataLists}>
      <div className={styles.dataItem} style={{ flex: "0 0 120px" }}>
        <div className={styles.contentHeading}>Date</div>
        <div>{hoveredDate}</div>
      </div>
      <div className={styles.dataItem} style={{ flex: "0 0 180px" }}>
        <div className={styles.contentHeading}>Expeditions</div>
        {expeditions.length > 0 && (
          <>
            {expeditions.map((expedition) => (
              <div key={expedition.expedition}>{`Expedition ${expedition.expedition}`}</div>
            ))}
          </>
        )}
      </div>
      <div className={styles.dataItem}>
        <div className={styles.contentHeading}>Crew Onboard</div>
        {crewOnboardList.length > 0 && (
          <>
            <div className={styles.contentColumns}>
              {crewOnboardList.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className={styles.dataItem}>
        <div className={styles.contentHeading}>Vehicles Docked</div>
        <div className={styles.contentColumns}>
          {flightsDocked.length > 0 && (
            <div className={styles.vehicleCategory}>
              <h3 className={styles.subheading}>Crew</h3>
              {flightsDocked.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
          )}
          {supplyFlightsDocked.length > 0 && (
            <div className={styles.vehicleCategory}>
              <h3 className={styles.subheading}>Supply</h3>
              {supplyFlightsDocked.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      <CrewSearch
        crewArrDep={crewArrDep}
        selectedCrewMember={selectedCrewMember}
        setSelectedCrewMember={setSelectedCrewMember}
      />
    </div>
  );
};

export default HoverAndSearch;

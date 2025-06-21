import { FunctionComponent } from "react";
import CrewSearch from "./crewSearch";
import styles from "./hoverAndSearch.module.css";

interface DataListsProps {
  expeditions: ExpeditionInfo[];
  crewOnboardList: string[];
  flightsDocked: string[];
  supplyFlightsDocked: string[];
  crewArrDep: CrewArrDepItem[];
  selectedCrewMember: CrewMember | null;
  setSelectedCrewMember: (crewMember: CrewMember | null) => void;
}

const HoverAndSearch: FunctionComponent<DataListsProps> = ({
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
      <div className={styles.dataItem}>
        <h2>Expeditions</h2>
        {expeditions.length > 0 && (
          <div>
            {expeditions.map((expedition) => (
              <div key={expedition.expedition}>{`Expedition ${expedition.expedition}`}</div>
            ))}
          </div>
        )}
      </div>
      <div className={styles.dataItem}>
        <h2>Crew Onboard</h2>
        {crewOnboardList.length > 0 && crewOnboardList.map((name) => <div key={name}>{name}</div>)}
      </div>
      <div className={styles.dataItem}>
        <h2>Crew Vehicles Docked</h2>
        {flightsDocked.length > 0 && (
          <div>
            {flightsDocked.map((name) => (
              <div key={name}>{name}</div>
            ))}
          </div>
        )}
      </div>
      <div className={styles.dataItem}>
        <h2>Supply Vehicles Docked</h2>
        {supplyFlightsDocked.length > 0 && (
          <div>
            {supplyFlightsDocked.map((name) => (
              <div key={name}>{name}</div>
            ))}
          </div>
        )}
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

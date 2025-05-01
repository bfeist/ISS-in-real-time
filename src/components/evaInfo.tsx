import { flagUrlByCountryName } from "utils/countries";
import styles from "./evaInfo.module.css";
import { JSX } from "react";

type Props = {
  evaDetails: EvaDetail[];
};

const EvaInfo = ({ evaDetails }: Props): JSX.Element => {
  const renderCrewMember = (c: { name: string; nationality: string; ev?: number }) => (
    <div key={c.name} className={styles.crewMember}>
      <img className={styles.flag} src={flagUrlByCountryName[c.nationality]} alt={c.nationality} />
      {c.ev ? `EV${c.ev}: ${c.name}` : c.name}
    </div>
  );

  return (
    <div className={styles.evaDetails}>
      {evaDetails.map((evaDetail) => (
        <div key={evaDetail.startTime} className={styles.evaDetail}>
          <div className={styles.evaTitle}>
            {evaDetail.mission} EVA #{evaDetail.missionEvaNum} ({evaDetail.number})
          </div>
          <div className={styles.evaCrew}>
            <strong>Crew:</strong>
            {(evaDetail.crew || []).map(renderCrewMember)}
          </div>
          {evaDetail.groundIVCrew?.length > 0 && (
            <div className={styles.evaGroundCrew}>
              <strong>Ground IV:</strong>
              {(evaDetail.groundIVCrew || []).map(renderCrewMember)}
            </div>
          )}
          <div
            className={styles.evaDescription}
            dangerouslySetInnerHTML={{ __html: evaDetail.description }}
          />
          <div className={styles.evaTimes}>
            <div>Start: {new Date(evaDetail.startTime).toLocaleString()}</div>
            <div>End: {new Date(evaDetail.endTime).toLocaleString()}</div>
            <div>Duration: {evaDetail.duration}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default EvaInfo;

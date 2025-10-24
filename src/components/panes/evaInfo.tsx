import { flagUrlByCountryName } from "utils/countries";
import styles from "./evaInfo.module.css";
import { FunctionComponent, JSX } from "react";
import { useStateClock } from "store/hooks/useStateClock";
import { useGeneralEvaDetails } from "api/useGeneralData";

const EvaInfo: FunctionComponent<{
  long: boolean;
}> = ({ long }): JSX.Element => {
  const { selectedDate } = useStateClock();
  const { data: evaDetails = [], isLoading } = useGeneralEvaDetails();

  const evaDetailsForDate = evaDetails.filter((evaDetail: EvaDetail) =>
    evaDetail.startTime.startsWith(selectedDate || "")
  );

  const renderCrewMember = (c: { name: string; nationality: string; ev?: number }) => (
    <div key={c.name} className={styles.crewMember}>
      <img className={styles.flag} src={flagUrlByCountryName[c.nationality]} alt={c.nationality} />
      {c.ev ? `EV${c.ev}: ${c.name}` : c.name}
    </div>
  );

  if (isLoading) {
    return (
      <div className={styles.evaDetails}>
        <div className={styles.scrollableContent}>Loading EVA details...</div>
      </div>
    );
  }

  if (evaDetailsForDate.length === 0) {
    return (
      <div className={styles.evaDetails}>
        <div className={styles.scrollableContent}>No EVA details for {selectedDate}</div>
      </div>
    );
  }

  return (
    <div className={styles.evaDetails}>
      <div className={styles.scrollableContent}>
        {evaDetailsForDate.map((evaDetail) => (
          <div key={evaDetail.startTime} className={long ? styles.evaDetail : null}>
            {long ? (
              // Long layout (existing full layout)
              <>
                <div className={styles.evaTitle}>
                  {evaDetail.mission} EVA #{evaDetail.missionEvaNum} ({evaDetail.number})
                </div>
                <div className={styles.evaCrew}>{(evaDetail.crew || []).map(renderCrewMember)}</div>
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
              </>
            ) : (
              // Short layout (compact horizontal layout)
              <div className={styles.evaShortContent}>
                <div className={styles.evaShortHeader}>
                  <div className={styles.evaShortTitle}>
                    {evaDetail.mission} EVA #{evaDetail.missionEvaNum}
                  </div>
                  <div className={styles.evaShortCrew}>
                    {(evaDetail.crew || []).map((c) => (
                      <div key={c.name} className={styles.crewMemberShort}>
                        <img
                          className={styles.flagShort}
                          src={flagUrlByCountryName[c.nationality]}
                          alt={c.nationality}
                        />
                        {c.ev ? `EV${c.ev}: ${c.name}` : c.name}
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  className={styles.blurbShort}
                  dangerouslySetInnerHTML={{ __html: evaDetail.description }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EvaInfo;

import { FunctionComponent, JSX, useMemo, useState } from "react";
import StatsModal from "./statsModal";
import DayCounter from "./dayCounter";
import styles from "./noDateSelected.module.css";
import { useStateToggle } from "store/hooks/useStateToggle";
import { useGeneralStats } from "api/useGeneralData";

const NoDateSelected: FunctionComponent = (): JSX.Element => {
  const { setShowTimelineYears } = useStateToggle();
  const { data: stats, isLoading, error } = useGeneralStats();

  const [showStats, setShowStats] = useState(false);

  const toLocaleString = (val: number | undefined): JSX.Element => {
    if (typeof val !== "number") return <span style={{ color: "white" }}>N/A</span>;
    return (
      <span style={{ color: "white" }}>
        {val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </span>
    );
  };

  const totalArticles = useMemo(() => {
    if (!stats) return null;
    return (
      stats.data_availability.counts["blog"] +
      stats.data_availability.counts["actSum"] +
      stats.data_availability.counts["timeline"]
    );
  }, [stats]);

  return (
    <div className={styles.container}>
      <div className={styles.pageContent}>
        <div className={styles.headerContent}>
          <h2>Re-live Every Day Onboard the International Space Station</h2>

          <p>This multimedia project consists entirely of original historical mission material.</p>
        </div>
        <DayCounter />
        <div className={styles.siteStats}>
          <h3>Site Statistics:</h3>
          <ul>
            {isLoading && <li>Loading statistics...</li>}
            {error && <li>Error loading statistics</li>}
            {stats && (
              <>
                <li>{toLocaleString(stats.data_availability.total_days)} days of mission data</li>
                <li>
                  {toLocaleString(stats.comm.total_words)} words of space-to-ground comm in{" "}
                  {toLocaleString(stats.comm.total_languages)} languages.
                </li>
                <li>{toLocaleString(stats.comm.total_utterances)} audio clips</li>
                <li>
                  {toLocaleString(stats.photos.combined.total_photos)} photos taken in space over{" "}
                  {toLocaleString(stats.photos.combined.total_days_with_photos)} days
                </li>
                <li>{toLocaleString(totalArticles)} articles</li>
                <li>
                  {toLocaleString(
                    (stats.videos.youtube.total_videos || 0) + (stats.videos.ia.total_videos || 0)
                  )}{" "}
                  videos
                </li>
              </>
            )}
          </ul>

          <div
            className={styles.statsLink}
            onClick={() => setShowStats(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setShowStats(true);
                e.preventDefault();
              }
            }}
          >
            (more)
          </div>
        </div>

        <div
          className={styles.exploreButton}
          onClick={() => {
            setShowTimelineYears(true);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setShowTimelineYears(true);
              e.preventDefault();
            }
          }}
        >
          Explore
        </div>
      </div>
      <StatsModal isOpen={showStats} onClose={() => setShowStats(false)} />
    </div>
  );
};

export default NoDateSelected;

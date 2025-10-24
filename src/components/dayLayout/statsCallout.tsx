import { FunctionComponent, JSX, useMemo } from "react";
import styles from "./statsCallout.module.css";

interface Props {
  stats: Stats | undefined;
  isLoading: boolean;
  error: Error | null;
  onShowStats: () => void;
}

const StatsCallout: FunctionComponent<Props> = ({
  stats,
  isLoading,
  error,
  onShowStats,
}): JSX.Element => {
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

  const totalDaysSinceStart = useMemo(() => {
    const start = new Date(2000, 10, 1); // November 1, 2000
    const now = new Date();
    const diffTime = now.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, []);

  return (
    <div className={styles.siteStats}>
      <h3>This Website Contains:</h3>
      <ul>
        {isLoading && <li>Loading statistics...</li>}
        {error && <li>Error loading statistics</li>}
        {stats && (
          <>
            <li>
              {toLocaleString(stats.data_availability.total_days)} /{" "}
              {toLocaleString(totalDaysSinceStart)} days with mission data (
              <span className={styles.percentage}>
                {((stats.data_availability.total_days / totalDaysSinceStart) * 100).toFixed(2)}%
              </span>
              ).
            </li>
            <li>
              {toLocaleString(stats.comm.total_days_with_transcripts)} days with full
              space-to-ground comm coverage.
            </li>
            <li>
              {toLocaleString(stats.comm.total_utterances)} space-to-ground comm calls in{" "}
              {toLocaleString(stats.comm.total_languages)} languages.
            </li>

            <li>
              {toLocaleString(stats.photos.combined.total_photos)} photos taken in space over{" "}
              {toLocaleString(stats.photos.combined.total_days_with_photos)} days.
            </li>
            <li>
              {toLocaleString(totalArticles)} articles across{" "}
              {toLocaleString(stats.data_availability.days_with_articles)} days.
            </li>
            <li>
              {toLocaleString(
                (stats.videos.youtube.total_videos || 0) + (stats.videos.ia.total_videos || 0)
              )}{" "}
              videos across {toLocaleString(stats.videos.total_days_with_videos)} days.
            </li>
          </>
        )}
      </ul>
      <div
        className={styles.statsLink}
        onClick={onShowStats}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onShowStats();
            e.preventDefault();
          }
        }}
      >
        More stats...
      </div>
    </div>
  );
};

export default StatsCallout;

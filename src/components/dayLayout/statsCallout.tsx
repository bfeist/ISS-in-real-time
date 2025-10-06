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

  return (
    <div className={styles.siteStats}>
      <h3>This Website Contains:</h3>
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

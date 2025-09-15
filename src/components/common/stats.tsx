import { FunctionComponent, JSX } from "react";
import { useGeneralStats } from "../../api/useGeneralData";
import styles from "./stats.module.css";

const Stats: FunctionComponent = (): JSX.Element => {
  const { data: stats, isLoading, error } = useGeneralStats();

  const getDataTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      comm: "Communications",
      vvComm: "VV Communications",
      video: "Videos",
      eva: "EVA",
      blog: "Blog Articles",
      actSum: "Activity Summaries",
      earthPhotos: "Earth Photos",
      photos: "Photos",
    };

    return (
      labels[type] || type.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase())
    );
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading stats...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>Error loading stats: {error.message}</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={styles.container}>
        <div className={styles.noData}>No stats available</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.statsContainer}>
        <h1 className={styles.title}>ISS In Real Time - Overall Statistics</h1>

        <div className={styles.sectionsGrid}>
          <section className={styles.section}>
            <h2>Communications</h2>
            <div className={styles.statGrid}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Days with Transcripts:</span>
                <span className={styles.statValue}>
                  {stats.comm.total_days_with_transcripts.toLocaleString()}
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Days with VV Transcripts:</span>
                <span className={styles.statValue}>
                  {stats.comm.total_days_with_vv_transcripts.toLocaleString()}
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Total Utterances:</span>
                <span className={styles.statValue}>
                  {stats.comm.total_utterances.toLocaleString()}
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Total Words:</span>
                <span className={styles.statValue}>{stats.comm.total_words.toLocaleString()}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Languages:</span>
                <span className={styles.statValue}>{stats.comm.total_languages}</span>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Photos</h2>
            <div className={styles.statGrid}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Total Photos:</span>
                <span className={styles.statValue}>
                  {stats.photos.combined.total_photos.toLocaleString()}
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Days with Photos:</span>
                <span className={styles.statValue}>
                  {stats.photos.combined.total_days_with_photos.toLocaleString()}
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Avg per Day:</span>
                <span className={styles.statValue}>
                  {stats.photos.combined.avg_photos_per_day.toFixed(1)}
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Coverage:</span>
                <span className={styles.statValue}>
                  {stats.photos.combined.coverage_percentage.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className={styles.sourcesGrid}>
              <div className={styles.source}>
                <h3>Earth Photography</h3>
                <div className={styles.statGrid}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Photos:</span>
                    <span className={styles.statValue}>
                      {stats.photos.sources.earth_photography.total_photos.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Days:</span>
                    <span className={styles.statValue}>
                      {stats.photos.sources.earth_photography.total_days_with_photos.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Avg/Day:</span>
                    <span className={styles.statValue}>
                      {stats.photos.sources.earth_photography.avg_photos_per_day.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.source}>
                <h3>images.nasa.gov</h3>
                <div className={styles.statGrid}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Photos:</span>
                    <span className={styles.statValue}>
                      {stats.photos.sources.images_nasa_gov.total_photos.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Days:</span>
                    <span className={styles.statValue}>
                      {stats.photos.sources.images_nasa_gov.total_days_with_photos.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Avg/Day:</span>
                    <span className={styles.statValue}>
                      {stats.photos.sources.images_nasa_gov.avg_photos_per_day.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.source}>
                <h3>Manual Photos</h3>
                <div className={styles.statGrid}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Photos:</span>
                    <span className={styles.statValue}>
                      {stats.photos.sources.photos_manual.total_photos.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Days:</span>
                    <span className={styles.statValue}>
                      {stats.photos.sources.photos_manual.total_days_with_photos.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Avg/Day:</span>
                    <span className={styles.statValue}>
                      {stats.photos.sources.photos_manual.avg_photos_per_day.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Videos</h2>
            <div className={styles.statGrid}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>YouTube Videos:</span>
                <span className={styles.statValue}>{stats.videos.youtube.total_videos}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Internet Archive Videos:</span>
                <span className={styles.statValue}>{stats.videos.ia.total_videos}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>YouTube Duration:</span>
                <span className={styles.statValue}>
                  {Math.floor(stats.videos.youtube.total_duration_seconds / 3600)}h{" "}
                  {Math.floor((stats.videos.youtube.total_duration_seconds % 3600) / 60)}m
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Internet Archive Duration:</span>
                <span className={styles.statValue}>
                  {Math.floor(stats.videos.ia.total_duration_seconds / 3600)}h{" "}
                  {Math.floor((stats.videos.ia.total_duration_seconds % 3600) / 60)}m
                </span>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Data Availability</h2>
            <div className={styles.statGrid}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Total Days:</span>
                <span className={styles.statValue}>{stats.data_availability.total_days}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Avg Types/Day:</span>
                <span className={styles.statValue}>
                  {stats.data_availability.avg_data_types_per_day.toFixed(1)}
                </span>
              </div>
            </div>

            <div className={styles.sourcesGrid}>
              <div className={styles.source}>
                <h3>Day Data Type Counts</h3>
                <div className={styles.statGrid}>
                  {Object.entries(stats.data_availability.counts).map(([type, count]) => (
                    <div key={type} className={styles.statItem}>
                      <span className={styles.statLabel}>{getDataTypeLabel(type)}:</span>
                      <span className={styles.statValue}>{count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className={styles.generatedAt}>
          Generated: {new Date(stats.generated_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
};

export default Stats;

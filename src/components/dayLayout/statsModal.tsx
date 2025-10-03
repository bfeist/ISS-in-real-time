import { FunctionComponent, JSX, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useGeneralStats } from "../../api/useGeneralData";
import styles from "./statsModal.module.css";
import CloseButton from "../common/closeButton";

const StatsModal: FunctionComponent<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }): JSX.Element => {
  const modalRef = useRef<HTMLDivElement>(null);
  const { data: stats, isLoading, error } = useGeneralStats();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return <></>;

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.modal} ref={modalRef}>
        <div className={styles.header}>
          <h3>ISS Data Overview</h3>
          <CloseButton onClick={onClose} />
        </div>
        <div className={styles.content}>
          {isLoading && <div className={styles.loading}>Loading stats...</div>}
          {error && <div className={styles.error}>Error loading stats: {error.message}</div>}
          {!stats && !isLoading && !error && (
            <div className={styles.noData}>No stats available</div>
          )}
          {stats && (
            <div className={styles.statsContainer}>
              {/* First Row */}
              <div className={styles.statsGrid}>
                <div className={styles.statsSection}>
                  <h4>Days With Data Type</h4>
                  <div className={styles.statRow}>
                    <span>Total Days:</span>
                    <span>{stats.data_availability.total_days.toLocaleString()}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span>Avg Types/Day:</span>
                    <span>{stats.data_availability.avg_data_types_per_day.toFixed(1)}</span>
                  </div>
                  {(() => {
                    const labels: Record<string, string> = {
                      eva: "EVAs",
                      comm: "S/G Comm",
                      vvComm: "VV Comm",
                      video: "Videos",
                      earthPhotos: "Earth Photos",
                      flickrPhotos: "Mission Photos",
                      blog: "Articles",
                      actSum: "Activity Summaries",
                      timeline: "Station Timelines",
                    };
                    return Object.keys(labels)
                      .filter((type) => type in stats.data_availability.counts)
                      .map((type) => {
                        const count = stats.data_availability.counts[type];
                        const label =
                          labels[type] ||
                          type.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase());
                        return (
                          <div key={type} className={styles.statRow}>
                            <span>{label}:</span>
                            <span>{count.toLocaleString()}</span>
                          </div>
                        );
                      });
                  })()}
                </div>

                <div className={styles.statsSection}>
                  <h4>Photos - All Sources</h4>
                  <div className={styles.statRow}>
                    <span>Total Photos:</span>
                    <span>{stats.photos.combined.total_photos.toLocaleString()}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span>Days with Photos:</span>
                    <span>{stats.photos.combined.total_days_with_photos.toLocaleString()}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span>Avg Photos/Day:</span>
                    <span>{stats.photos.combined.avg_photos_per_day.toFixed(1)}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span>Max Photos/Day:</span>
                    <span>{stats.photos.combined.max_photos_per_day.toLocaleString()}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span>Coverage:</span>
                    <span>{stats.photos.combined.coverage_percentage.toFixed(1)}%</span>
                  </div>
                </div>

                <div className={styles.stackedSection}>
                  <div className={styles.statsSection}>
                    <h4>Photo Sources</h4>
                    <div className={styles.statRow}>
                      <span>Earth Photos:</span>
                      <span>{stats.photos.sources.photos_earth.total_photos.toLocaleString()}</span>
                    </div>
                    <div className={styles.statRow}>
                      <span>Earth Coverage:</span>
                      <span>
                        {stats.photos.sources.photos_earth.coverage_percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className={styles.statRow}>
                      <span>Mission Photos:</span>
                      <span>
                        {stats.photos.sources.photos_flickr.total_photos.toLocaleString()}
                      </span>
                    </div>
                    <div className={styles.statRow}>
                      <span>Mission Coverage:</span>
                      <span>
                        {stats.photos.sources.photos_flickr.coverage_percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className={styles.statsSection}>
                    <h4>Videos</h4>
                    <div className={styles.statRow}>
                      <span>YouTube Videos:</span>
                      <span>{stats.videos.youtube.total_videos.toLocaleString()}</span>
                    </div>
                    <div className={styles.statRow}>
                      <span>YT Duration:</span>
                      <span>
                        {Math.floor(stats.videos.youtube.total_duration_seconds / 3600)}h{" "}
                        {Math.floor((stats.videos.youtube.total_duration_seconds % 3600) / 60)}m
                      </span>
                    </div>
                    <div className={styles.statRow}>
                      <span>Mission Videos:</span>
                      <span>{stats.videos.ia.total_videos.toLocaleString()}</span>
                    </div>
                    <div className={styles.statRow}>
                      <span>MV Duration:</span>
                      <span>
                        {Math.floor(stats.videos.ia.total_duration_seconds / 3600)}h{" "}
                        {Math.floor((stats.videos.ia.total_duration_seconds % 3600) / 60)}m
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Second Row */}
              <div className={styles.statsGrid}>
                <div className={styles.statsSection}>
                  <h4>Communications</h4>
                  <div className={styles.statRow}>
                    <span>Days with S/G Comm:</span>
                    <span>{stats.comm.total_days_with_transcripts.toLocaleString()}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span>Days with VV Comm:</span>
                    <span>{stats.comm.total_days_with_vv_transcripts.toLocaleString()}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span>Total Utterances:</span>
                    <span>{stats.comm.total_utterances.toLocaleString()}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span>Avg Utterances/Day:</span>
                    <span>{stats.comm.avg_utterances_per_day.toFixed(1)}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span>Total Words:</span>
                    <span>{stats.comm.total_words.toLocaleString()}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span>Languages:</span>
                    <span>{stats.comm.total_languages}</span>
                  </div>
                </div>
                <div className={styles.statsSection}>
                  <h4>Communication Channels</h4>
                  {Object.entries(stats.comm.channels)
                    .slice(0, 6)
                    .map(([channel, words]) => (
                      <div key={channel} className={styles.statRow}>
                        <span>S/G {channel} Words:</span>
                        <span>{words.toLocaleString()}</span>
                      </div>
                    ))}
                  {Object.keys(stats.comm.channels).length > 6 && (
                    <div className={styles.statRow}>
                      <span>+ {Object.keys(stats.comm.channels).length - 6} more channels</span>
                      <span></span>
                    </div>
                  )}
                </div>

                <div className={styles.statsSection}>
                  <h4>Words in Languages</h4>
                  {Object.entries(stats.comm.languages)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 6)
                    .map(([language, count]) => (
                      <div key={language} className={styles.statRow}>
                        <span>{language}:</span>
                        <span>{count.toLocaleString()}</span>
                      </div>
                    ))}
                  {Object.keys(stats.comm.languages).length > 6 && (
                    <div className={styles.statRow}>
                      <span>+ {Object.keys(stats.comm.languages).length - 6} more languages</span>
                      <span></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {stats && (
            <div className={styles.generatedAt}>
              Generated: {new Date(stats.generated_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default StatsModal;

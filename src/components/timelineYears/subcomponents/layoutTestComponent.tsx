import { FunctionComponent, useMemo } from "react";
import { useStateClock } from "store/hooks/useStateClock";
import { useGeneralDataAvailabilities } from "api/useGeneralData";
import styles from "./layoutTestComponent.module.css";

// Define all 32 layout permutations
const LAYOUT_PERMUTATIONS = [
  // Video layouts (16)
  { video: true, comm: true, eva: true, article: true, photo: true },
  { video: true, comm: true, eva: true, article: true, photo: false },
  { video: true, comm: true, eva: true, article: false, photo: true },
  { video: true, comm: true, eva: true, article: false, photo: false },
  { video: true, comm: true, eva: false, article: true, photo: true },
  { video: true, comm: true, eva: false, article: true, photo: false },
  { video: true, comm: true, eva: false, article: false, photo: true },
  { video: true, comm: true, eva: false, article: false, photo: false },
  { video: true, comm: false, eva: true, article: true, photo: true },
  { video: true, comm: false, eva: true, article: true, photo: false },
  { video: true, comm: false, eva: true, article: false, photo: true },
  { video: true, comm: false, eva: true, article: false, photo: false },
  { video: true, comm: false, eva: false, article: true, photo: true },
  { video: true, comm: false, eva: false, article: true, photo: false },
  { video: true, comm: false, eva: false, article: false, photo: true },
  { video: true, comm: false, eva: false, article: false, photo: false },
  // Comm layouts (8) - no video
  { video: false, comm: true, eva: true, article: true, photo: true },
  { video: false, comm: true, eva: true, article: true, photo: false },
  { video: false, comm: true, eva: true, article: false, photo: true },
  { video: false, comm: true, eva: true, article: false, photo: false },
  { video: false, comm: true, eva: false, article: true, photo: true },
  { video: false, comm: true, eva: false, article: true, photo: false },
  { video: false, comm: true, eva: false, article: false, photo: true },
  { video: false, comm: true, eva: false, article: false, photo: false },
  // Other layouts (8) - no video, no comm
  { video: false, comm: false, eva: true, article: true, photo: true },
  { video: false, comm: false, eva: true, article: true, photo: false },
  { video: false, comm: false, eva: true, article: false, photo: true },
  { video: false, comm: false, eva: true, article: false, photo: false },
  { video: false, comm: false, eva: false, article: true, photo: true },
  { video: false, comm: false, eva: false, article: true, photo: false },
  { video: false, comm: false, eva: false, article: false, photo: true },
  { video: false, comm: false, eva: false, article: false, photo: false },
];

type LayoutPermutation = {
  video: boolean;
  comm: boolean;
  eva: boolean;
  article: boolean;
  photo: boolean;
};

const getLayoutKey = (perm: LayoutPermutation): string => {
  const parts = [];
  if (perm.video) parts.push("video");
  if (perm.comm) parts.push("comm");
  if (perm.eva) parts.push("eva");
  if (perm.article) parts.push("article");
  if (perm.photo) parts.push("photo");
  return parts.length > 0 ? parts.join("-") : "none";
};

const matchesPermutation = (data: DataAvailability, perm: LayoutPermutation): boolean => {
  // Check video
  if (data.video !== perm.video) return false;

  // Check comm (includes both comm and vvComm)
  const hasComm = data.comm || data.vvComm;
  if (hasComm !== perm.comm) return false;

  // Check eva
  if (data.eva !== perm.eva) return false;

  // Check article (includes both blog and activitySummary)
  const hasArticle = data.blog || data.activitySummary;
  if (hasArticle !== perm.article) return false;

  // Check photo
  if (data.earthPhotography !== perm.photo) return false;

  return true;
};

// Abbreviated names for the buttons
const LAYOUT_ABBREVIATIONS: Record<string, string> = {
  "video-comm-eva-article-photo": "V+C+E+A+P",
  "video-comm-eva-article": "V+C+E+A",
  "video-comm-eva-photo": "V+C+E+P",
  "video-comm-eva": "V+C+E",
  "video-comm-article-photo": "V+C+A+P",
  "video-comm-article": "V+C+A",
  "video-comm-photo": "V+C+P",
  "video-comm": "V+C",
  "video-eva-article-photo": "V+E+A+P",
  "video-eva-article": "V+E+A",
  "video-eva-photo": "V+E+P",
  "video-eva": "V+E",
  "video-article-photo": "V+A+P",
  "video-article": "V+A",
  "video-photo": "V+P",
  video: "V",
  "comm-eva-article-photo": "C+E+A+P",
  "comm-eva-article": "C+E+A",
  "comm-eva-photo": "C+E+P",
  "comm-eva": "C+E",
  "comm-article-photo": "C+A+P",
  "comm-article": "C+A",
  "comm-photo": "C+P",
  comm: "C",
  "eva-article-photo": "E+A+P",
  "eva-article": "E+A",
  "eva-photo": "E+P",
  eva: "E",
  "article-photo": "A+P",
  article: "A",
  photo: "P",
  none: "None",
};

// Order the layouts in logical groups
const LAYOUT_ORDER = [
  // Video layouts (16)
  "video-comm-eva-article-photo",
  "video-comm-eva-article",
  "video-comm-eva-photo",
  "video-comm-eva",
  "video-comm-article-photo",
  "video-comm-article",
  "video-comm-photo",
  "video-comm",
  "video-eva-article-photo",
  "video-eva-article",
  "video-eva-photo",
  "video-eva",
  "video-article-photo",
  "video-article",
  "video-photo",
  "video",

  // Comm layouts (8)
  "comm-eva-article-photo",
  "comm-eva-article",
  "comm-eva-photo",
  "comm-eva",
  "comm-article-photo",
  "comm-article",
  "comm-photo",
  "comm",

  // No comm layouts (8)
  "eva-article-photo",
  "eva-article",
  "eva-photo",
  "eva",
  "article-photo",
  "article",
  "photo",
  "none",
];

const LayoutTestComponent: FunctionComponent = () => {
  const { setSelectedDate } = useStateClock();
  const { data: dataAvailabilityItems, isLoading } = useGeneralDataAvailabilities();

  // Calculate layout test data from actual data availability
  const layoutTestData = useMemo(() => {
    if (!dataAvailabilityItems) return {};

    const results: Record<string, string | null> = {};

    // For each permutation, find the first matching date
    for (const perm of LAYOUT_PERMUTATIONS) {
      const layoutKey = getLayoutKey(perm);

      let foundDate: string | null = null;

      // Special handling for "none" permutation - look for missing dates
      if (layoutKey === "none") {
        // Generate a comprehensive date range and find missing dates
        const startDate = new Date("2000-11-02"); // ISS first occupied
        const endDate = new Date();
        const existingDates = new Set(dataAvailabilityItems.map((item) => item.date));

        // Look for the first missing date using day-by-day iteration
        const startTime = startDate.getTime();
        const endTime = endDate.getTime();
        const dayInMs = 24 * 60 * 60 * 1000;

        for (let timeMs = startTime; timeMs <= endTime; timeMs += dayInMs) {
          const dateStr = new Date(timeMs).toISOString().split("T")[0];
          if (!existingDates.has(dateStr)) {
            foundDate = dateStr;
            break;
          }
        }
      } else {
        // For all other permutations, search through existing data
        for (const dataItem of dataAvailabilityItems) {
          if (matchesPermutation(dataItem, perm)) {
            foundDate = dataItem.date;
            break;
          }
        }
      }

      results[layoutKey] = foundDate;
    }

    return results;
  }, [dataAvailabilityItems]);

  // Count available and missing permutations
  const { availableCount, missingCount } = useMemo(() => {
    const available = Object.values(layoutTestData).filter((date) => date !== null).length;
    return {
      availableCount: available,
      missingCount: LAYOUT_PERMUTATIONS.length - available,
    };
  }, [layoutTestData]);

  const handleLayoutSelect = (layoutKey: string) => {
    const date = layoutTestData[layoutKey];
    if (date) {
      setSelectedDate(date);
    } else {
      console.warn(`No date available for layout: ${layoutKey}`);
    }
  };

  const getButtonClassName = (layoutKey: string) => {
    if (layoutKey.startsWith("video-comm")) return styles.videoCommButton;
    if (layoutKey.startsWith("video")) return styles.videoButton;
    if (layoutKey.startsWith("comm")) return styles.commButton;
    return styles.noCommButton;
  };

  if (isLoading) {
    return (
      <div className={styles.layoutTestContainer}>
        <h3 className={styles.title}>Layout Tester</h3>
        <p className={styles.description}>Loading layout data...</p>
      </div>
    );
  }

  return (
    <div className={styles.layoutTestContainer}>
      <h3 className={styles.title}>Layout Tester</h3>
      <p className={styles.description}>
        Test all 32 layout permutations (V=Video, C=Comm, E=EVA, A=Article, P=Photo).
        <br />
        {availableCount} permutations found, {missingCount} not found (shown in grey):
      </p>

      <div className={styles.layoutGrid}>
        {LAYOUT_ORDER.map((layoutKey) => (
          <button
            key={layoutKey}
            className={`${styles.layoutButton} ${getButtonClassName(layoutKey)}`}
            onClick={() => handleLayoutSelect(layoutKey)}
            title={`${layoutKey} - ${layoutTestData[layoutKey] || "No date with this combination"}`}
            disabled={!layoutTestData[layoutKey]}
          >
            {LAYOUT_ABBREVIATIONS[layoutKey]}
          </button>
        ))}
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.videoCommColor}`}></div>
          <span>Video + Comm</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.videoColor}`}></div>
          <span>Video Only</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.commColor}`}></div>
          <span>Comm Only</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.noCommColor}`}></div>
          <span>No Comm/Video</span>
        </div>
      </div>
    </div>
  );
};

export default LayoutTestComponent;

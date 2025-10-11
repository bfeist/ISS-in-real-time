import { FunctionComponent, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight, faVideoSlash } from "@fortawesome/free-solid-svg-icons";
import styles from "./videoNone.module.css";
import IconButton from "components/common/iconButton";
import { useGeneralVideoIa, useGeneralVideoYt } from "api/useGeneralData";
import { useStateClock } from "store/hooks/useStateClock";
import { appSecondsFromTimeStr } from "utils/time";

// Type for combined video items with start time
type CombinedVideo = {
  startSeconds: number;
  endSeconds: number;
  type: "youtube" | "ia";
};

interface NoVideoProps {
  message?: string;
  appSeconds?: number;
}
const VideoNone: FunctionComponent<NoVideoProps> = ({
  message = "Video unavailable at this time",
  appSeconds: appSecondsProp,
}) => {
  const { data: videoYt = [], isLoading: isloadingYt } = useGeneralVideoYt();
  const { data: videoIa = [], isLoading: isloadingIa } = useGeneralVideoIa();
  const { selectedDate, setTimeOnly, appSecondsAtStartStop, startStopTimestamp } = useStateClock();

  const isLoading = isloadingYt || isloadingIa;

  // Get all videos for the selected date and combine them
  const videosForDate = useMemo<CombinedVideo[]>(() => {
    if (!selectedDate) return [];

    const combined: CombinedVideo[] = [];

    // Add YouTube video if available for this date
    const ytVideo = videoYt?.find(
      (recording: VideoYtItem) =>
        recording?.ytStartTime.startsWith(selectedDate) && recording.duration > 0
    );

    if (ytVideo) {
      const startTimeToUse = ytVideo.derivedStartTime || ytVideo.ytStartTime;
      const startSeconds = appSecondsFromTimeStr(startTimeToUse.split("T")[1]);
      combined.push({
        startSeconds,
        endSeconds: startSeconds + ytVideo.duration,
        type: "youtube",
      });
    }

    // Add all IA videos for this date
    const iaVideos = videoIa?.filter((recording: VideoIaItem) => recording?.date === selectedDate);

    if (iaVideos) {
      iaVideos.forEach((video: VideoIaItem) => {
        const startSeconds = appSecondsFromTimeStr(video.time);
        combined.push({
          startSeconds,
          endSeconds: startSeconds + video.duration,
          type: "ia",
        });
      });
    }

    // Sort by start time
    return combined.sort((a, b) => a.startSeconds - b.startSeconds);
  }, [selectedDate, videoYt, videoIa]);

  // Find current video index and position based on current time
  const { currentVideoIndex, isAfterLastVideo } = useMemo(() => {
    // Get current appSeconds - use prop if provided, otherwise calculate
    const appSeconds =
      appSecondsProp !== undefined
        ? appSecondsProp
        : (() => {
            const secondsSinceStarted = (Date.now() - Date.parse(startStopTimestamp)) / 1000;
            return Math.floor(appSecondsAtStartStop + secondsSinceStarted);
          })();

    // Find which video we're currently in (or would be in)
    let index = -1;
    let afterLast = false;

    for (let i = 0; i < videosForDate.length; i++) {
      const video = videosForDate[i];
      if (appSeconds >= video.startSeconds && appSeconds <= video.endSeconds) {
        index = i;
        break;
      }
      // If we're past this video but before the next, consider this as the "current" position
      if (appSeconds < video.startSeconds) {
        index = i - 1;
        break;
      }
    }

    // If we're past all videos, mark that we're after the last video
    if (
      index === -1 &&
      videosForDate.length > 0 &&
      appSeconds > videosForDate[videosForDate.length - 1].endSeconds
    ) {
      afterLast = true;
    }

    return { currentVideoIndex: index, isAfterLastVideo: afterLast };
  }, [videosForDate, appSecondsAtStartStop, startStopTimestamp, appSecondsProp]);

  // Determine if previous/next videos exist
  const hasPreviousVideo = currentVideoIndex > 0 || (isAfterLastVideo && videosForDate.length > 0);
  const hasNextVideo =
    (currentVideoIndex < videosForDate.length - 1 && !isAfterLastVideo) ||
    (currentVideoIndex === -1 && !isAfterLastVideo && videosForDate.length > 0);

  const jumpToVideo = (direction: "next" | "previous") => {
    if (videosForDate.length === 0) return;

    let targetIndex: number;

    if (direction === "previous") {
      if (isAfterLastVideo) {
        // If we're past the last video, jump to the last video
        targetIndex = videosForDate.length - 1;
      } else if (currentVideoIndex === -1) {
        // If we're not in any video and before all videos, no previous video exists
        return;
      } else if (currentVideoIndex > 0) {
        targetIndex = currentVideoIndex - 1;
      } else {
        return; // No previous video
      }
    } else {
      // direction === "next"
      if (currentVideoIndex === -1 && !isAfterLastVideo) {
        // If we're not in any video and before all videos, jump to the first video
        targetIndex = 0;
      } else if (currentVideoIndex >= 0 && currentVideoIndex < videosForDate.length - 1) {
        targetIndex = currentVideoIndex + 1;
      } else {
        return; // No next video
      }
    }

    const targetVideo = videosForDate[targetIndex];
    if (targetVideo) {
      setTimeOnly(targetVideo.startSeconds);
    }
  };

  return (
    <div className={styles.noVideoContainer}>
      <FontAwesomeIcon icon={faVideoSlash} className={styles.icon} />
      <div className={styles.message}>{message}</div>
      {videosForDate.length > 0 && (
        <div className={styles.buttons}>
          <IconButton
            icon={faArrowLeft}
            onClick={() => jumpToVideo("previous")}
            label="Jump to Prev Video"
            enabled={hasPreviousVideo && !isLoading}
          />
          <IconButton
            icon={faArrowRight}
            onClick={() => jumpToVideo("next")}
            label="Jump to Next Video"
            iconRight={true}
            enabled={hasNextVideo && !isLoading}
          />
        </div>
      )}
    </div>
  );
};

export default VideoNone;

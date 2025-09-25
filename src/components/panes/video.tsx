import { FunctionComponent, useState, useMemo } from "react";
import { useStateClock } from "store/hooks/useStateClock";
import { useGeneralVideoYt, useGeneralVideoIa } from "api/useGeneralData";
import { appSecondsFromTimeStr } from "utils/time";
import YtVideoComponent from "./videoYt";
import VideoIaComponent from "./videoIa";
import ClockInterval from "./clockInterval";
import VideoNone from "./videoNone";

const VideoComponent: FunctionComponent = () => {
  const { selectedDate, appSecondsAtStartStop, isRunning, startStopTimestamp } = useStateClock();
  const [appSeconds, setAppSeconds] = useState(() => {
    const secondsSinceStarted = (Date.now() - Date.parse(startStopTimestamp)) / 1000;
    const newAppSeconds = Math.floor(appSecondsAtStartStop + secondsSinceStarted);
    return Math.min(newAppSeconds, 86401);
  });

  const { data: videoYt = [], isLoading: isloadingYt } = useGeneralVideoYt();
  const { data: videoIa = [], isLoading: isloadingIa } = useGeneralVideoIa();

  const isLoading = isloadingYt || isloadingIa;

  // Get all videos for the selected date
  const videoYtRecording = videoYt?.find(
    (recording: VideoYtItem) =>
      recording?.ytStartTime.startsWith(selectedDate || "") && recording.duration > 0
  );

  const videoIaRecordings = videoIa?.filter(
    (recording: VideoIaItem) => recording?.date === selectedDate
  );

  // Determine which video should be active based on current appSeconds
  const activeVideo = useMemo(() => {
    if (isLoading) return { type: "loading" as const };

    let ytVideoActive = false;
    let iaVideoActive = false;

    // Check if YouTube video should be active
    if (videoYtRecording) {
      const startTimeToUse = videoYtRecording.derivedStartTime || videoYtRecording.ytStartTime;
      const ytStartSeconds = appSecondsFromTimeStr(startTimeToUse.split("T")[1]);
      const ytEndSeconds = ytStartSeconds + videoYtRecording.duration;

      if (appSeconds >= ytStartSeconds && appSeconds <= ytEndSeconds) {
        ytVideoActive = true;
      }
    }

    // Check if any IA video should be active
    if (videoIaRecordings && videoIaRecordings.length > 0) {
      for (const video of videoIaRecordings) {
        const iaStartSeconds = appSecondsFromTimeStr(video.time);
        const iaEndSeconds = iaStartSeconds + video.duration;

        if (appSeconds >= iaStartSeconds && appSeconds <= iaEndSeconds) {
          iaVideoActive = true;
          break;
        }
      }
    }

    // If both are active at the same time, prefer YouTube (as per original logic)
    if (ytVideoActive) {
      return {
        type: "youtube" as const,
        data: videoYtRecording,
      };
    }

    if (iaVideoActive) {
      return {
        type: "ia" as const,
        data: videoIaRecordings,
      };
    }

    // If no video is currently active but we have videos for this date, show "no video for current time"
    if (videoYtRecording || (videoIaRecordings && videoIaRecordings.length > 0)) {
      return { type: "none-available-for-time" as const };
    }

    // No videos available for this date at all
    return { type: "none-available" as const };
  }, [isLoading, videoYtRecording, videoIaRecordings, appSeconds]);

  if (activeVideo.type === "loading") {
    return <div>Loading video data...</div>;
  }

  if (activeVideo.type === "youtube" && activeVideo.data) {
    return (
      <YtVideoComponent videoId={activeVideo.data.videoId} videoYtRecording={activeVideo.data} />
    );
  }

  if (activeVideo.type === "ia" && activeVideo.data) {
    return <VideoIaComponent videoIaRecordings={activeVideo.data} />;
  }

  if (activeVideo.type === "none-available-for-time") {
    return (
      <>
        <ClockInterval setAppSeconds={setAppSeconds} />
        <VideoNone />
      </>
    );
  }

  return (
    <>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <VideoNone />
    </>
  );
};

export default VideoComponent;

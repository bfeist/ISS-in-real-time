import { FunctionComponent, useState } from "react";
import { useStateClock } from "store/hooks/useStateClock";
import { useGeneralVideoYt, useGeneralVideoIa } from "api/useGeneralData";
import { appSecondsFromTimeStr } from "utils/dateTime";
import YtVideoComponent from "./videoYt";
import VideoIaComponent from "./videoIa";
import ClockInterval from "./clockInterval";
import VideoNone from "./videoNone";

const VideoComponent: FunctionComponent = () => {
  const { selectedDate, appSecondsAtStartStop, startStopTimestamp } = useStateClock();
  const [appSeconds, setAppSeconds] = useState(() => {
    const secondsSinceStarted = (Date.now() - Date.parse(startStopTimestamp)) / 1000;
    const newAppSeconds = Math.floor(appSecondsAtStartStop + secondsSinceStarted);
    return Math.min(newAppSeconds, 86401);
  });

  const { data: videoYt = [], isLoading: isloadingYt } = useGeneralVideoYt();
  const { data: videoIa = [], isLoading: isloadingIa } = useGeneralVideoIa();

  const isLoading = isloadingYt || isloadingIa;

  // Get all videos for the selected date - no longer need useMemo since we're passing as props
  const videoYtRecording = videoYt?.find(
    (recording: VideoYtItem) =>
      recording?.ytStartTime.startsWith(selectedDate || "") && recording.duration > 0
  );

  const videoIaRecordings = videoIa?.filter(
    (recording: VideoIaItem) => recording?.date === selectedDate
  );

  // Determine which video should be active based on current appSeconds
  // No useMemo needed - we recalculate on every render which is fine since appSeconds changes frequently
  let activeVideo: { type: string; data?: VideoYtItem | VideoIaItem } = { type: "loading" };

  if (!isLoading) {
    let activeYtVideo: VideoYtItem | null = null;
    let activeIaVideo: VideoIaItem | null = null;

    // Check if YouTube video should be active
    if (videoYtRecording) {
      const startTimeToUse = videoYtRecording.derivedStartTime || videoYtRecording.ytStartTime;
      const ytStartSeconds = appSecondsFromTimeStr(startTimeToUse.split("T")[1]);
      const ytEndSeconds = ytStartSeconds + videoYtRecording.duration;

      if (appSeconds >= ytStartSeconds && appSeconds <= ytEndSeconds) {
        activeYtVideo = videoYtRecording;
      }
    }

    // Check if any IA video should be active - find THE specific video
    if (videoIaRecordings && videoIaRecordings.length > 0) {
      for (const video of videoIaRecordings) {
        // Ensure video has required properties
        if (!video || !video.time || !video.duration || !video.filename) {
          console.warn("Invalid IA video item:", video);
          continue;
        }

        const iaStartSeconds = appSecondsFromTimeStr(video.time);
        const iaEndSeconds = iaStartSeconds + video.duration;

        if (appSeconds >= iaStartSeconds && appSeconds <= iaEndSeconds) {
          activeIaVideo = video;
          break;
        }
      }
    }

    // If both are active at the same time, prefer YouTube (as per original logic)
    if (activeYtVideo) {
      activeVideo = {
        type: "youtube",
        data: activeYtVideo,
      };
    } else if (activeIaVideo) {
      activeVideo = {
        type: "ia",
        data: activeIaVideo,
      };
    } else if (videoYtRecording || (videoIaRecordings && videoIaRecordings.length > 0)) {
      // If no video is currently active but we have videos for this date
      activeVideo = { type: "none-available-for-time" };
    } else {
      // No videos available for this date at all
      activeVideo = { type: "none-available" };
    }
  }

  return (
    <>
      <ClockInterval setAppSeconds={setAppSeconds} />
      {(() => {
        if (activeVideo.type === "loading") {
          return <div>Loading video data...</div>;
        }

        if (activeVideo.type === "youtube" && activeVideo.data) {
          const ytData = activeVideo.data as VideoYtItem;
          return (
            <YtVideoComponent
              videoId={ytData.videoId}
              videoYtRecording={ytData}
              appSeconds={appSeconds}
            />
          );
        }

        if (activeVideo.type === "ia" && activeVideo.data) {
          const iaData = activeVideo.data as VideoIaItem;
          return <VideoIaComponent currentVideo={iaData} appSeconds={appSeconds} />;
        }

        return (
          <VideoNone
            appSeconds={appSeconds}
            videoYtRecording={videoYtRecording}
            videoIaRecordings={videoIaRecordings}
          />
        );
      })()}
    </>
  );
};

export default VideoComponent;

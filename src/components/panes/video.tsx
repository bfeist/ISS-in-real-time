import { FunctionComponent, useEffect, useRef, useState } from "react";
import YouTube, { YouTubePlayer, YouTubeEvent } from "react-youtube";
import styles from "./video.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";
import { useGeneralVideoYt, useGeneralVideoIa } from "api/useGeneralData";
import { getBaseStaticUrl } from "utils/api";

const VideoComponent: FunctionComponent = () => {
  const { selectedDate } = useStateClock();

  const { data: videoYt = [], isLoading: isloadingYt } = useGeneralVideoYt();
  const { data: videoIa = [], isLoading: isloadingIa } = useGeneralVideoIa();

  const isLoading = isloadingYt || isloadingIa;

  const videoYtRecording = videoYt?.find((recording: VideoYt) =>
    recording?.ytStartTime.startsWith(selectedDate || "")
  );

  const videoIaRecording = videoIa?.find(
    (recording: VideoIaItem) => recording?.date === selectedDate
  );

  if (isLoading) {
    return <div>Loading video data...</div>;
  }

  // Prefer YouTube if available, otherwise use IA video
  if (videoYtRecording) {
    return (
      <YtVideoComponent videoId={videoYtRecording.videoId} videoYtRecording={videoYtRecording} />
    );
  }

  if (videoIaRecording) {
    return <VideoIaComponent videoIaRecording={videoIaRecording} />;
  }

  return <div>No video available for this date</div>;
};

export default VideoComponent;

interface YtVideoComponentProps {
  videoId: string;
  videoYtRecording: VideoYt;
}

const YtVideoComponent: FunctionComponent<YtVideoComponentProps> = ({
  videoId,
  videoYtRecording,
}) => {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [appSeconds, setAppSeconds] = useState(0);

  const { isRunning } = useStateClock();

  const onPlayerReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    playerRef.current.mute();
  };

  useEffect(() => {
    if (!playerRef.current) return;

    const syncTime = async () => {
      const playerState = await playerRef.current.getPlayerState();
      const isPlaying = playerState === YouTube.PlayerState.PLAYING;

      if (isRunning && !isPlaying) {
        playerRef.current.playVideo();
      } else if (!isRunning && isPlaying) {
        playerRef.current.pauseVideo();
      }

      // sync the player time with the clock
      const startTimeToUse = videoYtRecording?.derivedStartTime || videoYtRecording.ytStartTime;
      if (!startTimeToUse) return;

      const ytStartSeconds = appSecondsFromTimeStr(startTimeToUse.split("T")[1]);
      const playerAppSeconds = Math.round(
        ytStartSeconds + (await playerRef.current.getCurrentTime())
      );
      if (playerAppSeconds !== appSeconds) {
        // set the player time to the clock time
        playerRef.current.seekTo(appSeconds - ytStartSeconds, true);
      }
    };
    syncTime();
  }, [isRunning, videoYtRecording, appSeconds]);

  return (
    <>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <YouTube
        className={styles.yt}
        videoId={videoId}
        onReady={onPlayerReady}
        opts={{
          playerVars: { autoplay: 0 },
          height: "100%",
          width: "100%",
        }}
      />
    </>
  );
};

interface VideoIaComponentProps {
  videoIaRecording: VideoIaItem;
}

const VideoIaComponent: FunctionComponent<VideoIaComponentProps> = ({ videoIaRecording }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [appSeconds, setAppSeconds] = useState(0);

  const { isRunning } = useStateClock();

  useEffect(() => {
    if (!videoRef.current) return;

    const syncTime = () => {
      const video = videoRef.current;
      if (!video) return;

      // Control play/pause based on clock state
      if (isRunning && video.paused) {
        video.play().catch(console.error);
      } else if (!isRunning && !video.paused) {
        video.pause();
      }

      // sync the video time with the clock
      const iaStartSeconds = appSecondsFromTimeStr(videoIaRecording.time);
      const videoAppSeconds = Math.round(iaStartSeconds + video.currentTime);

      if (videoAppSeconds !== appSeconds) {
        // set the video time to the clock time
        const targetTime = Math.max(0, appSeconds - iaStartSeconds);
        video.currentTime = targetTime;
      }
    };

    syncTime();
  }, [isRunning, videoIaRecording, appSeconds]);

  // Construct the video URL using the base static URL
  const baseStaticUrl = getBaseStaticUrl();
  const videoUrl = `${baseStaticUrl}/videos/${videoIaRecording.filename}`;

  return (
    <>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <video
        ref={videoRef}
        className={styles.yt} // Reuse the same CSS class for consistent styling
        controls={false}
        muted
        style={{ width: "100%", height: "100%" }}
      >
        <source src={videoUrl} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </>
  );
};

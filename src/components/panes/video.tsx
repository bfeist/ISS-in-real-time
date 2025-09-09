import { FunctionComponent, useEffect, useRef, useState, useMemo } from "react";
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

  const videoYtRecording = videoYt?.find((recording: VideoYtItem) =>
    recording?.ytStartTime.startsWith(selectedDate || "")
  );

  const videoIaRecordings = videoIa?.filter(
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

  if (videoIaRecordings && videoIaRecordings.length > 0) {
    return <VideoIaComponent videoIaRecordings={videoIaRecordings} />;
  }

  return <div>No video available for this date</div>;
};

export default VideoComponent;

interface YtVideoComponentProps {
  videoId: string;
  videoYtRecording: VideoYtItem;
}

const YtVideoComponent: FunctionComponent<YtVideoComponentProps> = ({
  videoId,
  videoYtRecording,
}) => {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const [appSeconds, setAppSeconds] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  const { isRunning, appSecondsAtStartStop, startStopTimestamp } = useStateClock();

  // Initialize appSeconds with the current clock time immediately
  useEffect(() => {
    const calculateCurrentAppSeconds = () => {
      const secondsSinceStarted = (Date.now() - Date.parse(startStopTimestamp)) / 1000;
      const newAppSeconds = Math.floor(appSecondsAtStartStop + secondsSinceStarted);
      return Math.min(newAppSeconds, 86401);
    };

    setAppSeconds(calculateCurrentAppSeconds());
  }, [appSecondsAtStartStop, startStopTimestamp]);

  const onPlayerReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    playerRef.current.mute();
    playerRef.current.getDuration().then(setDuration);
    setIsPlayerReady(true);
  };

  useEffect(() => {
    if (!playerRef.current || !isPlayerReady) return;

    const playerState = playerRef.current.getPlayerState();
    const isPlaying = playerState === YouTube.PlayerState.PLAYING;

    if (isRunning && !isPlaying) {
      playerRef.current.playVideo();
    } else if (!isRunning && isPlaying) {
      playerRef.current.pauseVideo();
    }
  }, [isRunning, isPlayerReady]);

  useEffect(() => {
    if (!playerRef.current || !isPlayerReady) return;

    const syncTime = async () => {
      // Throttle synchronization to at most once per second
      const now = Date.now();
      if (now - lastSyncTimeRef.current < 1000) return;
      lastSyncTimeRef.current = now;

      const playerState = await playerRef.current.getPlayerState();

      // Don't sync during buffering to avoid interrupting the buffering process
      if (playerState === YouTube.PlayerState.BUFFERING) return;

      // sync the player time with the clock
      const startTimeToUse = videoYtRecording?.derivedStartTime || videoYtRecording.ytStartTime;
      if (!startTimeToUse) return;

      const ytStartSeconds = appSecondsFromTimeStr(startTimeToUse.split("T")[1]);
      const playerAppSeconds = Math.round(
        ytStartSeconds + (await playerRef.current.getCurrentTime())
      );

      // Only seek if the difference is more than 2 seconds to reduce frequent seeking
      if (Math.abs(playerAppSeconds - appSeconds) > 2) {
        // set the player time to the clock time
        playerRef.current.seekTo(Math.max(0, appSeconds - ytStartSeconds), true);
      }
    };
    syncTime();
  }, [videoYtRecording, appSeconds, isPlayerReady]);

  const startTimeToUse = videoYtRecording?.derivedStartTime || videoYtRecording.ytStartTime;
  const ytStartSeconds = startTimeToUse ? appSecondsFromTimeStr(startTimeToUse.split("T")[1]) : 0;
  const isInRange =
    duration === null ||
    (appSeconds >= ytStartSeconds && appSeconds <= ytStartSeconds + (duration || 0));

  return (
    <>
      <ClockInterval setAppSeconds={setAppSeconds} />
      {isInRange ? (
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
      ) : (
        <div>No video available for this time</div>
      )}
    </>
  );
};

interface VideoIaComponentProps {
  videoIaRecordings: VideoIaItem[];
}

const VideoIaComponent: FunctionComponent<VideoIaComponentProps> = ({ videoIaRecordings }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const [appSeconds, setAppSeconds] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const { isRunning, appSecondsAtStartStop, startStopTimestamp } = useStateClock();

  // Initialize appSeconds with the current clock time immediately
  useEffect(() => {
    const calculateCurrentAppSeconds = () => {
      const secondsSinceStarted = (Date.now() - Date.parse(startStopTimestamp)) / 1000;
      const newAppSeconds = Math.floor(appSecondsAtStartStop + secondsSinceStarted);
      return Math.min(newAppSeconds, 86401);
    };

    setAppSeconds(calculateCurrentAppSeconds());
  }, [appSecondsAtStartStop, startStopTimestamp]);

  // Find the current video based on appSeconds
  const currentVideo = useMemo(() => {
    if (!videoIaRecordings.length) return null;

    // Sort by start time
    const sorted = [...videoIaRecordings].sort(
      (a, b) => appSecondsFromTimeStr(a.time) - appSecondsFromTimeStr(b.time)
    );

    // Find a video where start <= appSeconds <= start + duration
    for (const video of sorted) {
      const start = appSecondsFromTimeStr(video.time);
      const end = start + video.duration;

      if (appSeconds >= start && appSeconds <= end) {
        return video;
      }
    }

    // If none found within duration ranges, return null
    return null;
  }, [videoIaRecordings, appSeconds]);

  // Reset error and ready state when video changes
  useEffect(() => {
    setVideoError(null);
    setIsReady(false);
  }, [currentVideo]);

  useEffect(() => {
    if (!videoRef.current || !currentVideo || !isReady) return;

    const video = videoRef.current;

    // Control play/pause based on clock state
    if (isRunning && video.paused) {
      video.play().catch(console.error);
    } else if (!isRunning && !video.paused) {
      video.pause();
    }
  }, [isRunning, currentVideo, isReady]);

  useEffect(() => {
    if (!videoRef.current || !currentVideo || !isReady) return;

    const syncTime = () => {
      // Throttle synchronization to at most once per second
      const now = Date.now();
      if (now - lastSyncTimeRef.current < 1000) return;
      lastSyncTimeRef.current = now;

      const video = videoRef.current;
      if (!video) return;

      // sync the video time with the clock
      const iaStartSeconds = appSecondsFromTimeStr(currentVideo.time);
      const videoAppSeconds = Math.round(iaStartSeconds + video.currentTime);

      // Increased tolerance to 2 seconds to reduce frequent seeking
      if (Math.abs(videoAppSeconds - appSeconds) > 2) {
        const targetTime = Math.max(0, appSeconds - iaStartSeconds);
        video.currentTime = targetTime;
      }
    };

    syncTime();
  }, [currentVideo, appSeconds, isReady]);

  if (!currentVideo) {
    return <div>No video available for this time</div>;
  }

  if (videoError) {
    return <div>Error loading video: {videoError}</div>;
  }

  // Construct the video URL using the base static URL
  const baseStaticUrl = getBaseStaticUrl();
  const videoUrl = `${baseStaticUrl}/videoIa/${currentVideo.filename}`;

  return (
    <>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <video
        key={currentVideo.filename}
        ref={videoRef}
        className={styles.yt} // Reuse the same CSS class for consistent styling
        controls={true}
        muted
        style={{ width: "100%", height: "100%" }}
        onError={() => setVideoError(`Failed to load video: ${currentVideo.filename}`)}
        onCanPlay={() => setIsReady(true)}
      >
        <source src={videoUrl} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </>
  );
};

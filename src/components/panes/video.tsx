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

  const videoYtRecording = videoYt?.find(
    (recording: VideoYtItem) =>
      recording?.ytStartTime.startsWith(selectedDate || "") && recording.duration > 0
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
  const lastPlaybackCheckRef = useRef<number>(0);
  const [appSeconds, setAppSeconds] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [hasWindowFocus, setHasWindowFocus] = useState(true);

  const { isRunning, appSecondsAtStartStop, startStopTimestamp } = useStateClock();

  // Track window focus to handle video sync issues when returning from background
  useEffect(() => {
    const handleFocus = () => setHasWindowFocus(true);
    const handleBlur = () => setHasWindowFocus(false);
    const handleVisibilityChange = () => {
      setHasWindowFocus(!document.hidden);
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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
    try {
      playerRef.current = event.target;
      playerRef.current.mute();
      setIsPlayerReady(true);
    } catch (error) {
      console.error("Error in onPlayerReady:", error);
      setIsPlayerReady(true);
    }
  };

  const onPlayerError = (event: YouTubeEvent) => {
    const errorCode = event.data;
    let errorMessage = "Unknown YouTube player error";

    switch (errorCode) {
      case 2:
        errorMessage = "Invalid video ID";
        break;
      case 5:
        errorMessage = "HTML5 player error";
        break;
      case 100:
        errorMessage = "Video not found or private";
        break;
      case 101:
      case 150:
        errorMessage = "Video cannot be embedded";
        break;
    }

    console.error("YouTube player error:", errorMessage, errorCode);
  };

  const onPlayerStateChange = (_event: YouTubeEvent) => {
    // No longer logging state changes
  };

  useEffect(() => {
    if (!playerRef.current || !isPlayerReady) return;

    const handlePlaybackControl = async () => {
      try {
        const playerState = await playerRef.current.getPlayerState();
        const isPlaying = playerState === YouTube.PlayerState.PLAYING;

        if (isRunning && !isPlaying) {
          // Only try to play if not already buffering
          if (playerState !== YouTube.PlayerState.BUFFERING) {
            await playerRef.current.playVideo();
          }
        } else if (!isRunning && isPlaying) {
          await playerRef.current.pauseVideo();
        }
      } catch (error) {
        console.error("Error controlling YouTube player:", error);
      }
    };

    handlePlaybackControl();
  }, [isRunning, isPlayerReady]);

  // Enhanced playback control that continuously monitors and corrects video state
  useEffect(() => {
    if (!playerRef.current || !isPlayerReady) return;

    const checkAndCorrectPlayback = async () => {
      try {
        const now = Date.now();
        // Check playback state more frequently than sync (every 500ms)
        if (now - lastPlaybackCheckRef.current < 500) return;
        lastPlaybackCheckRef.current = now;

        const playerState = await playerRef.current.getPlayerState();
        const isPlaying = playerState === YouTube.PlayerState.PLAYING;

        if (isRunning) {
          // If clock is running but video is paused (and not buffering), restart it
          if (
            !isPlaying &&
            playerState !== YouTube.PlayerState.BUFFERING &&
            playerState !== YouTube.PlayerState.UNSTARTED
          ) {
            console.log("Clock running but video paused, restarting playback");
            await playerRef.current.playVideo();
          }
        } else {
          // If clock is stopped but video is still playing, pause it
          if (isPlaying) {
            console.log("Clock stopped but video playing, pausing playback");
            await playerRef.current.pauseVideo();
          }
        }
      } catch (error) {
        console.error("Error in playback monitoring:", error);
      }
    };

    const interval = setInterval(checkAndCorrectPlayback, 500);
    return () => clearInterval(interval);
  }, [isRunning, isPlayerReady, hasWindowFocus]);

  useEffect(() => {
    if (!playerRef.current || !isPlayerReady) return;

    const syncTime = async () => {
      try {
        // Throttle synchronization to at most once per second, but allow immediate sync when focus is regained
        const now = Date.now();
        const shouldForceSync = hasWindowFocus && now - lastSyncTimeRef.current > 2000; // Force sync if focus regained and 2+ seconds since last sync
        if (!shouldForceSync && now - lastSyncTimeRef.current < 1000) return;
        lastSyncTimeRef.current = now;

        const playerState = await playerRef.current.getPlayerState();

        // Don't sync during buffering or unstarted state
        if (
          playerState === YouTube.PlayerState.BUFFERING ||
          playerState === YouTube.PlayerState.UNSTARTED
        ) {
          return;
        }

        // sync the player time with the clock
        const startTimeToUse = videoYtRecording?.derivedStartTime || videoYtRecording.ytStartTime;
        if (!startTimeToUse) return;

        const ytStartSeconds = appSecondsFromTimeStr(startTimeToUse.split("T")[1]);
        const currentTime = await playerRef.current.getCurrentTime();
        const playerAppSeconds = Math.round(ytStartSeconds + currentTime);

        // Use more aggressive sync tolerance when focus is regained or if large difference
        const syncTolerance = shouldForceSync || !hasWindowFocus ? 1 : 2;
        const timeDiff = Math.abs(playerAppSeconds - appSeconds);
        if (timeDiff > syncTolerance) {
          const seekToTime = Math.max(0, appSeconds - ytStartSeconds);
          // Use API duration for bounds checking instead of calling player getDuration
          const apiDuration = videoYtRecording?.duration || 0;
          if (seekToTime <= apiDuration) {
            await playerRef.current.seekTo(seekToTime, true);
          }
        }
      } catch (error) {
        console.error("Error syncing YouTube player time:", error);
      }
    };
    syncTime();
  }, [videoYtRecording, appSeconds, isPlayerReady, hasWindowFocus]);

  // Special effect to handle window focus regain - immediately check and fix sync
  useEffect(() => {
    if (!hasWindowFocus || !playerRef.current || !isPlayerReady || !isRunning) return;

    const handleFocusRegain = async () => {
      try {
        // Small delay to let the player stabilize after focus regain
        await new Promise((resolve) => setTimeout(resolve, 200));

        const playerState = await playerRef.current.getPlayerState();
        const isPlaying = playerState === YouTube.PlayerState.PLAYING;

        // Force play if clock is running but video is not playing
        if (!isPlaying && playerState !== YouTube.PlayerState.BUFFERING) {
          console.log("Window focus regained, forcing video play");
          await playerRef.current.playVideo();
        }

        // Reset sync timer to force immediate sync check
        lastSyncTimeRef.current = 0;
      } catch (error) {
        console.error("Error handling focus regain:", error);
      }
    };

    handleFocusRegain();
  }, [hasWindowFocus, isPlayerReady, isRunning]);

  // Add a cleanup effect to handle component unmounting
  useEffect(() => {
    return () => {
      // Clear the player reference when component unmounts
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (error) {
          console.error("Error destroying YouTube player:", error);
        }
        playerRef.current = null;
      }
    };
  }, []);

  const startTimeToUse = videoYtRecording?.derivedStartTime || videoYtRecording.ytStartTime;
  const ytStartSeconds = startTimeToUse ? appSecondsFromTimeStr(startTimeToUse.split("T")[1]) : 0;
  // Use the API duration from videoYtRecording instead of the player duration
  const videoDuration = videoYtRecording?.duration || 0;
  const isInRange =
    appSeconds >= ytStartSeconds && // Must be at or after video start time
    appSeconds <= ytStartSeconds + videoDuration; // Within video duration

  return (
    <>
      <ClockInterval setAppSeconds={setAppSeconds} />
      {isInRange ? (
        <YouTube
          className={styles.yt}
          videoId={videoId}
          onReady={onPlayerReady}
          onError={onPlayerError}
          onStateChange={onPlayerStateChange}
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
  const lastPlaybackCheckRef = useRef<number>(0);
  const [appSeconds, setAppSeconds] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasWindowFocus, setHasWindowFocus] = useState(true);

  const { isRunning, appSecondsAtStartStop, startStopTimestamp } = useStateClock();

  // Track window focus to handle video sync issues when returning from background
  useEffect(() => {
    const handleFocus = () => setHasWindowFocus(true);
    const handleBlur = () => setHasWindowFocus(false);
    const handleVisibilityChange = () => {
      setHasWindowFocus(!document.hidden);
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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

  // Enhanced playback control that continuously monitors and corrects video state
  useEffect(() => {
    if (!videoRef.current || !currentVideo || !isReady) return;

    const checkAndCorrectPlayback = () => {
      const now = Date.now();
      // Check playback state more frequently than sync (every 500ms)
      if (now - lastPlaybackCheckRef.current < 500) return;
      lastPlaybackCheckRef.current = now;

      const video = videoRef.current;
      if (!video) return;

      if (isRunning) {
        // If clock is running but video is paused, restart it
        if (video.paused && !video.ended) {
          console.log("Clock running but IA video paused, restarting playback");
          video.play().catch(console.error);
        }
      } else {
        // If clock is stopped but video is still playing, pause it
        if (!video.paused) {
          console.log("Clock stopped but IA video playing, pausing playback");
          video.pause();
        }
      }
    };

    const interval = setInterval(checkAndCorrectPlayback, 500);
    return () => clearInterval(interval);
  }, [isRunning, currentVideo, isReady, hasWindowFocus]);

  // Special effect to handle window focus regain - immediately check and fix sync
  useEffect(() => {
    if (!hasWindowFocus || !videoRef.current || !currentVideo || !isReady || !isRunning) return;

    const handleFocusRegain = async () => {
      const video = videoRef.current;
      if (!video) return;

      // Small delay to let the video stabilize after focus regain
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Force play if clock is running but video is paused
      if (video.paused && !video.ended) {
        console.log("Window focus regained, forcing IA video play");
        video.play().catch(console.error);
      }

      // Reset sync timer to force immediate sync check
      lastSyncTimeRef.current = 0;
    };

    handleFocusRegain();
  }, [hasWindowFocus, currentVideo, isReady, isRunning]);

  useEffect(() => {
    if (!videoRef.current || !currentVideo || !isReady) return;

    const syncTime = () => {
      // Throttle synchronization to at most once per second, but allow immediate sync when focus is regained
      const now = Date.now();
      const shouldForceSync = hasWindowFocus && now - lastSyncTimeRef.current > 2000; // Force sync if focus regained and 2+ seconds since last sync
      if (!shouldForceSync && now - lastSyncTimeRef.current < 1000) return;
      lastSyncTimeRef.current = now;

      const video = videoRef.current;
      if (!video) return;

      // sync the video time with the clock
      const iaStartSeconds = appSecondsFromTimeStr(currentVideo.time);
      const videoAppSeconds = Math.round(iaStartSeconds + video.currentTime);

      // Use more aggressive sync tolerance when focus is regained or if large difference
      const syncTolerance = shouldForceSync || !hasWindowFocus ? 1 : 2;
      if (Math.abs(videoAppSeconds - appSeconds) > syncTolerance) {
        const targetTime = Math.max(0, appSeconds - iaStartSeconds);
        video.currentTime = targetTime;
      }
    };

    syncTime();
  }, [currentVideo, appSeconds, isReady, hasWindowFocus]);

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

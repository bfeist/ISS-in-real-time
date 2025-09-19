import { FunctionComponent, useEffect, useRef, useState, useMemo } from "react";
import styles from "./videoIa.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";
import { getBaseStaticUrl } from "utils/api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faVolumeHigh,
  faVolumeMute,
  faExpand,
  faCompress,
} from "@fortawesome/free-solid-svg-icons";
import VideoNone from "./videoNone";

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
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Handle mute toggle
  const handleMuteToggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsMuted((prev) => {
      const newMutedState = !prev;
      if (videoRef.current) {
        videoRef.current.muted = newMutedState;
      }
      return newMutedState;
    });
  };

  // Handle fullscreen toggle
  const handleFullscreenToggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    const container = videoRef.current?.parentElement;
    if (!container) return;

    if (!isFullscreen) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Update video element muted property when state changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

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
    return (
      <>
        <ClockInterval setAppSeconds={setAppSeconds} />
        <VideoNone />
      </>
    );
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
      <div className={styles.videoContainer}>
        <video
          key={currentVideo.filename}
          ref={videoRef}
          className={styles.yt} // Reuse the same CSS class for consistent styling
          controls={false}
          muted={isMuted}
          style={{ width: "100%", height: "100%" }}
          onError={() => setVideoError(`Failed to load video: ${currentVideo.filename}`)}
          onCanPlay={() => setIsReady(true)}
        >
          <source src={videoUrl} type="video/mp4" />
          <track kind="captions" srcLang="en" label="No captions available" />
          Your browser does not support the video tag.
        </video>
        <div className={styles.controlsOverlay}>
          <button
            className={styles.controlButton}
            onClick={handleMuteToggle}
            type="button"
            aria-label={isMuted ? "Unmute video" : "Mute video"}
          >
            <FontAwesomeIcon icon={isMuted ? faVolumeMute : faVolumeHigh} />
          </button>
          <button
            className={styles.controlButton}
            onClick={handleFullscreenToggle}
            type="button"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} />
          </button>
        </div>
      </div>
    </>
  );
};

export default VideoIaComponent;

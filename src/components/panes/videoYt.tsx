import { FunctionComponent, useEffect, useRef, useState } from "react";
import YouTube, { YouTubePlayer, YouTubeEvent } from "react-youtube";
import styles from "./videoYt.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faVolumeHigh,
  faVolumeMute,
  faExpand,
  faCompress,
} from "@fortawesome/free-solid-svg-icons";
import VideoNone from "./videoNone";

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

  const onPlayerReady = (event: YouTubeEvent) => {
    try {
      playerRef.current = event.target;
      // Set volume to 100% for maximum loudness
      playerRef.current.setVolume(100);
      // Mute the player initially since isMuted starts as true
      playerRef.current.mute();
      setIsPlayerReady(true);
    } catch (error) {
      console.error("Error in onPlayerReady:", error);
      setIsPlayerReady(true);
    }
  };

  const handleMuteToggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsMuted((prev) => !prev);
  };

  // Handle fullscreen toggle
  const handleFullscreenToggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    const container = document.querySelector(`.${styles.videoContainer}`) as HTMLElement;
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

  // Update player mute state when isMuted changes
  useEffect(() => {
    if (playerRef.current && isPlayerReady) {
      const updateMuteState = async () => {
        try {
          const playerState = await playerRef.current.getPlayerState();
          // Only update mute state if player is in a valid state (not unstarted)
          if (playerState !== YouTube.PlayerState.UNSTARTED && playerState !== null) {
            if (isMuted) {
              playerRef.current.mute();
            } else {
              // Ensure volume is at 100% when unmuting
              playerRef.current.setVolume(100);
              playerRef.current.unMute();
            }
          }
        } catch (error) {
          console.error("Error updating YouTube player mute state:", error);
        }
      };

      updateMuteState();
    }
  }, [isMuted, isPlayerReady]);

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
            // Ensure volume is at 100% before playing
            playerRef.current.setVolume(100);
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
            // Ensure volume is at 100% before playing
            playerRef.current.setVolume(100);
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
          // Ensure volume is at 100% before playing
          playerRef.current.setVolume(100);
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
        <div className={styles.videoContainer}>
          <YouTube
            className={`${styles.yt} ${styles.ytNoPointer}`}
            videoId={videoId}
            onReady={onPlayerReady}
            onError={onPlayerError}
            onStateChange={onPlayerStateChange}
            opts={{
              playerVars: { autoplay: 0, controls: 0 },
              height: "100%",
              width: "100%",
            }}
          />
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
      ) : (
        <VideoNone />
      )}
    </>
  );
};

export default YtVideoComponent;

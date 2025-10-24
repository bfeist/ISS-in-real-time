import { FunctionComponent, useEffect, useRef, useState, useCallback } from "react";
import YouTube, { YouTubePlayer, YouTubeEvent } from "react-youtube";
import styles from "./videoYt.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateToggle } from "store/hooks/useStateToggle";
import { appSecondsFromTimeStr } from "utils/dateTime";
import {
  faVolumeHigh,
  faVolumeMute,
  faExpand,
  faCompress,
  faShare,
} from "@fortawesome/free-solid-svg-icons";
import IconButton from "../common/iconButton";

interface YtVideoComponentProps {
  videoId: string;
  videoYtRecording: VideoYtItem;
  appSeconds: number;
}

const YtVideoComponent: FunctionComponent<YtVideoComponentProps> = ({
  videoId,
  videoYtRecording,
  appSeconds,
}) => {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const lastPlaybackCheckRef = useRef<number>(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [hasWindowFocus, setHasWindowFocus] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { isRunning } = useStateClock();
  const { videoMute, setVideoMute } = useStateToggle();
  const isMuted = videoMute;

  // Helper function to check if player is ready and valid for API calls
  const isPlayerReadyAndValid = useCallback(async (): Promise<boolean> => {
    if (!playerRef.current || !isPlayerReady) {
      return false;
    }

    try {
      // Try to get player state to verify the player is accessible
      const state = await playerRef.current.getPlayerState();
      // Return true if we can get a valid state (even if it's unstarted)
      return state !== null && state !== undefined;
    } catch (error) {
      // If we can't get the state, the player isn't ready for API calls
      return false;
    }
  }, [isPlayerReady]);

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

  const onPlayerReady = (event: YouTubeEvent) => {
    try {
      playerRef.current = event.target;
      // Set volume to 100% for maximum loudness
      playerRef.current.setVolume(100);
      if (isMuted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
      setIsPlayerReady(true);
    } catch (error) {
      console.error("Error in onPlayerReady:", error);
      setIsPlayerReady(true);
    }
  };

  const handleMuteToggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    const newMute = !videoMute;
    if (playerRef.current) {
      if (newMute) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
        playerRef.current.setVolume(100);
      }
    }
    setVideoMute(newMute);
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

  // Handle share button - open video on YouTube in new window
  const handleShare = (event: React.MouseEvent) => {
    event.stopPropagation();
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    window.open(youtubeUrl, "_blank", "noopener,noreferrer");
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
    if (!playerRef.current || !isPlayerReady) return;

    const updateMuteState = async () => {
      try {
        // Check if player is ready and valid for API calls
        const playerValid = await isPlayerReadyAndValid();
        if (!playerValid) return;

        const playerState = await playerRef.current!.getPlayerState();
        // Only update mute state if player is in a valid state (not unstarted)
        if (playerState !== YouTube.PlayerState.UNSTARTED && playerState !== null) {
          if (isMuted) {
            await playerRef.current!.mute();
          } else {
            // Ensure volume is at 100% when unmuting
            await playerRef.current!.setVolume(100);
            await playerRef.current!.unMute();
          }
        }
      } catch (error) {
        // Suppress the error as it's likely a timing issue with the YouTube API
        // The mute state will be corrected on the next attempt
      }
    };

    updateMuteState();
  }, [isMuted, isPlayerReady, isPlayerReadyAndValid]);

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
        // Check if player is ready and valid for API calls
        const playerValid = await isPlayerReadyAndValid();
        if (!playerValid) return;

        const playerState = await playerRef.current!.getPlayerState();
        const isPlaying = playerState === YouTube.PlayerState.PLAYING;

        if (isRunning && !isPlaying) {
          // Only try to play if not already buffering
          if (playerState !== YouTube.PlayerState.BUFFERING) {
            // Ensure volume is at 100% before playing
            await playerRef.current!.setVolume(100);
            await playerRef.current!.playVideo();
          }
        } else if (!isRunning && isPlaying) {
          await playerRef.current!.pauseVideo();
        }
      } catch (error) {
        // Suppress error - likely a timing issue with YouTube API
      }
    };

    handlePlaybackControl();
  }, [isRunning, isPlayerReady, isPlayerReadyAndValid]);

  // Enhanced playback control that continuously monitors and corrects video state
  useEffect(() => {
    if (!playerRef.current || !isPlayerReady) return;

    const checkAndCorrectPlayback = async () => {
      try {
        const now = Date.now();
        // Check playback state more frequently than sync (every 500ms)
        if (now - lastPlaybackCheckRef.current < 500) return;
        lastPlaybackCheckRef.current = now;

        // Check if player is ready and valid for API calls
        const playerValid = await isPlayerReadyAndValid();
        if (!playerValid) return;

        const playerState = await playerRef.current!.getPlayerState();
        const isPlaying = playerState === YouTube.PlayerState.PLAYING;

        if (isRunning) {
          // If clock is running but video is paused (and not buffering), restart it
          if (
            !isPlaying &&
            playerState !== YouTube.PlayerState.BUFFERING &&
            playerState !== YouTube.PlayerState.UNSTARTED
          ) {
            // Ensure volume is at 100% before playing
            await playerRef.current!.setVolume(100);
            await playerRef.current!.playVideo();
          }
        } else {
          // If clock is stopped but video is still playing, pause it
          if (isPlaying) {
            await playerRef.current!.pauseVideo();
          }
        }
      } catch (error) {
        // Suppress error - likely a timing issue with YouTube API
      }
    };

    const interval = setInterval(checkAndCorrectPlayback, 500);
    return () => clearInterval(interval);
  }, [isRunning, isPlayerReady, hasWindowFocus, isPlayerReadyAndValid]);

  useEffect(() => {
    if (!playerRef.current || !isPlayerReady) return;

    const syncTime = async () => {
      try {
        // Throttle synchronization to at most once per second, but allow immediate sync when focus is regained
        const now = Date.now();
        const shouldForceSync = hasWindowFocus && now - lastSyncTimeRef.current > 2000; // Force sync if focus regained and 2+ seconds since last sync
        if (!shouldForceSync && now - lastSyncTimeRef.current < 1000) return;
        lastSyncTimeRef.current = now;

        // Check if player is ready and valid for API calls
        const playerValid = await isPlayerReadyAndValid();
        if (!playerValid) return;

        const playerState = await playerRef.current!.getPlayerState();

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
        const currentTime = await playerRef.current!.getCurrentTime();
        const playerAppSeconds = Math.round(ytStartSeconds + currentTime);

        // Use more aggressive sync tolerance when focus is regained or if large difference
        const syncTolerance = shouldForceSync || !hasWindowFocus ? 1 : 2;
        const timeDiff = Math.abs(playerAppSeconds - appSeconds);
        if (timeDiff > syncTolerance) {
          const seekToTime = Math.max(0, appSeconds - ytStartSeconds);
          // Use API duration for bounds checking instead of calling player getDuration
          const apiDuration = videoYtRecording?.duration || 0;
          if (seekToTime <= apiDuration) {
            await playerRef.current!.seekTo(seekToTime, true);
          }
        }
      } catch (error) {
        // Suppress error - likely a timing issue with YouTube API
      }
    };
    syncTime();
  }, [videoYtRecording, appSeconds, isPlayerReady, hasWindowFocus, isPlayerReadyAndValid]);

  // Special effect to handle window focus regain - immediately check and fix sync
  useEffect(() => {
    if (!hasWindowFocus || !playerRef.current || !isPlayerReady || !isRunning) return;

    const handleFocusRegain = async () => {
      try {
        // Small delay to let the player stabilize after focus regain
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Check if player is ready and valid for API calls
        const playerValid = await isPlayerReadyAndValid();
        if (!playerValid) return;

        const playerState = await playerRef.current!.getPlayerState();
        const isPlaying = playerState === YouTube.PlayerState.PLAYING;

        // Force play if clock is running but video is not playing
        if (!isPlaying && playerState !== YouTube.PlayerState.BUFFERING) {
          // Ensure volume is at 100% before playing
          await playerRef.current!.setVolume(100);
          await playerRef.current!.playVideo();
        }

        // Reset sync timer to force immediate sync check
        lastSyncTimeRef.current = 0;
      } catch (error) {
        // Suppress error - likely a timing issue with YouTube API
      }
    };

    handleFocusRegain();
  }, [hasWindowFocus, isPlayerReady, isRunning, isPlayerReadyAndValid]);

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

  return (
    <div className={styles.videoContainer}>
      <YouTube
        className={`${styles.yt} ${styles.ytNoPointer}`}
        videoId={videoId}
        onReady={onPlayerReady}
        onError={onPlayerError}
        onStateChange={onPlayerStateChange}
        opts={{
          playerVars: {
            autoplay: 0,
            controls: 0,
            rel: 0,
            showinfo: 0,
            modestbranding: 1,
            iv_load_policy: 3,
          },
          height: "100%",
          width: "100%",
        }}
      />
      <div className={styles.controlsOverlay}>
        <div className={styles.iconButtonWrapper}>
          <IconButton
            icon={isMuted ? faVolumeMute : faVolumeHigh}
            onClick={handleMuteToggle}
            tooltipContent="Toggle Mute"
            // label={isMuted ? "Unmute" : "Mute"}
          />
        </div>
        <div className={styles.iconButtonWrapper}>
          <IconButton
            icon={isFullscreen ? faCompress : faExpand}
            tooltipContent="Toggle Fullscreen"
            onClick={handleFullscreenToggle}
            // label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          />
        </div>
        <div className={styles.iconButtonWrapper}>
          <IconButton
            icon={faShare}
            tooltipContent="Open video on YouTube"
            onClick={handleShare}
            // label="Open video on YouTube"
          />
        </div>
      </div>
    </div>
  );
};

export default YtVideoComponent;

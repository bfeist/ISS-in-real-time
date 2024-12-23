import { FunctionComponent, useEffect, useRef } from "react";
import YouTube, { YouTubePlayer, YouTubeEvent } from "react-youtube";
import styles from "./youtube.module.css";
import { useClockContext } from "context/clockContext";
import { appSecondsFromTimeStr } from "utils/time";

const YouTubeComponent: FunctionComponent<{
  youtubeLiveRecording: YoutubeLiveRecording;
}> = ({ youtubeLiveRecording }) => {
  const playerRef = useRef<YouTubePlayer | null>(null);

  const { clock } = useClockContext();

  const onPlayerReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    playerRef.current.mute();
  };

  useEffect(() => {
    if (!playerRef.current) return;

    const syncTime = async () => {
      const playerState = await playerRef.current.getPlayerState();
      const isPlaying = playerState === YouTube.PlayerState.PLAYING;

      if (clock.isRunning && !isPlaying) {
        playerRef.current.playVideo();
      } else if (!clock.isRunning && isPlaying) {
        playerRef.current.pauseVideo();
      }

      // sync the player time with the clock
      const ytStartSeconds = appSecondsFromTimeStr(youtubeLiveRecording?.startTime.split("T")[1]);
      const playerAppSeconds = Math.round(
        ytStartSeconds + (await playerRef.current.getCurrentTime())
      );
      if (playerAppSeconds !== clock.appSeconds) {
        // set the player time to the clock time
        playerRef.current.seekTo(clock.appSeconds - ytStartSeconds, true);
      }
    };
    syncTime();
  }, [clock, youtubeLiveRecording]);

  return (
    <>
      {youtubeLiveRecording ? (
        <YouTube
          className={styles.yt}
          videoId={youtubeLiveRecording?.videoId}
          onReady={onPlayerReady}
          opts={{
            playerVars: { autoplay: 0 },
            height: "100%",
            width: "100%",
          }}
        />
      ) : (
        <div className={styles.noVideo}>No video available for this date</div>
      )}
    </>
  );
};

export default YouTubeComponent;

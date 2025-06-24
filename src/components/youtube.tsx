import { FunctionComponent, useEffect, useRef, useState } from "react";
import YouTube, { YouTubePlayer, YouTubeEvent } from "react-youtube";
import styles from "./youtube.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";
import { useGeneralYoutubeData } from "api/useGeneralData";

const YouTubeComponent: FunctionComponent = () => {
  const { selectedDate } = useStateSelectedDate();
  const { setClock } = useStateClock();

  const { data: youtubeLiveRecordings = [], isLoading } = useGeneralYoutubeData();

  const youtubeLiveRecording = youtubeLiveRecordings?.find((recording: YoutubeLiveRecording) =>
    recording.startTime.startsWith(selectedDate || "")
  );

  const playerRef = useRef<YouTubePlayer | null>(null);
  const [appSeconds, setAppSeconds] = useState(0);

  const { isRunning } = useStateClock();

  const onPlayerReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    playerRef.current.mute();
  };

  useEffect(() => {
    if (!youtubeLiveRecording) return;

    // Set the clock to the start time of the YouTube recording
    const startTimeStr = youtubeLiveRecording.startTime.split("T")[1];
    setClock(appSecondsFromTimeStr(startTimeStr));
  }, [youtubeLiveRecording, setClock]);

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
      const ytStartSeconds = appSecondsFromTimeStr(youtubeLiveRecording?.startTime.split("T")[1]);
      const playerAppSeconds = Math.round(
        ytStartSeconds + (await playerRef.current.getCurrentTime())
      );
      if (playerAppSeconds !== appSeconds) {
        // set the player time to the clock time
        playerRef.current.seekTo(appSeconds - ytStartSeconds, true);
      }
    };
    syncTime();
  }, [isRunning, youtubeLiveRecording, appSeconds]);

  if (isLoading) {
    return <div>Loading video data...</div>;
  }

  return (
    <>
      <ClockInterval setAppSeconds={setAppSeconds} />
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
        <div>No video available for this date</div>
      )}
    </>
  );
};

export default YouTubeComponent;

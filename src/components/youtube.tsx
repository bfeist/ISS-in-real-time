import { FunctionComponent, useEffect, useRef } from "react";
import YouTube, { YouTubePlayer, YouTubeEvent } from "react-youtube";
import styles from "./youtube.module.css";

const YouTubeComponent: FunctionComponent<{
  youtubeLiveRecording: YoutubeLiveRecording;
  timeDef: TimeDef;
}> = ({ youtubeLiveRecording, timeDef }) => {
  const playerRef = useRef<YouTubePlayer | null>(null);
  // const timeStrRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const updateTime = () => {
      if (timeDef.running) {
        // if (timeStrRef.current) {
        //   timeStrRef.current.innerHTML = timeStringFromTimeDef(timeDef);
        // }
      }
    };
    const intervalId = setInterval(updateTime, 500);
    return () => {
      clearInterval(intervalId);
    };
  }, [timeDef]);

  const onPlayerReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    playerRef.current.mute();
    playerRef.current.seekTo(30, true);
    playerRef.current.playVideo();
  };

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

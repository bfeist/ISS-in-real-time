import { FunctionComponent, useRef } from "react";
import YouTube, { YouTubePlayer, YouTubeEvent } from "react-youtube";
import styles from "./youtube.module.css";

const YouTubeComponent: FunctionComponent<{
  youtubeLiveRecording: YoutubeLiveRecording;
}> = ({ youtubeLiveRecording }) => {
  const playerRef = useRef<YouTubePlayer | null>(null);
  // const timeStrRef = useRef<HTMLSpanElement>(null);

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

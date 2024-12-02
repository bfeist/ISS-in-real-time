import { FunctionComponent, useRef } from "react";
import YouTube, { YouTubePlayer, YouTubeEvent } from "react-youtube";
import styles from "./youtube.module.css";

const YouTubeComponent: FunctionComponent<{ timeDef: TimeDef }> = ({ timeDef }) => {
  const playerRef = useRef<YouTubePlayer | null>(null);

  const onPlayerReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    playerRef.current.mute();
    playerRef.current.seekTo(30);
    playerRef.current.playVideo();
  };

  return (
    <YouTube
      className={styles.yt}
      videoId="yN75W5AIQ2w"
      onReady={onPlayerReady}
      opts={{
        playerVars: { autoplay: 0 },
        height: "100%",
        width: "100%",
      }}
    />
  );
};

export default YouTubeComponent;

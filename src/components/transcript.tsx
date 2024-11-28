import { extractChannelnumFromFilename } from "utils/transcript";
import { FunctionComponent, useRef } from "react";
import styles from "./transcript.module.css";

type TranscriptProps = {
  viewDate: string;
  transcriptItems: TranscriptItem[];
};

const Transcript: FunctionComponent<TranscriptProps> = ({ viewDate, transcriptItems }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL;

  return (
    <>
      <div className={styles.audioPlayer}>
        <audio ref={audioRef} controls>
          <source src="horse.ogg" type="audio/ogg" />
          <source src="horse.mp3" type="audio/mpeg" />
          <track src="" kind="captions" label="English" />
          Your browser does not support the audio element.
        </audio>
      </div>
      <div className={styles.transcripts}>
        {transcriptItems.map((item, index) => {
          const [year, month, day] = viewDate.split("-");
          const aacFileUrl = `${baseStaticUrl}/comm/${year}/${month}/${day}/${item.filename}`;
          const channelnum = extractChannelnumFromFilename(item.filename);

          return (
            <div
              key={index}
              className={styles.transcriptItem}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.src = aacFileUrl;
                  audioRef.current.play();
                }
              }}
              onKeyDown={() => {
                if (audioRef.current) {
                  audioRef.current.play();
                  audioRef.current.src = aacFileUrl;
                }
              }}
            >
              <div className={styles.utteranceTime}>{item.utteranceTime}</div>
              <div className={styles.channelnum}>SG-{channelnum}</div>
              <div className={styles.textContainer}>
                <div className={styles.text}>{item.text}</div>
                {item.textOriginalLang && (
                  <div className={styles.textOriginalLang}>{item.textOriginalLang}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default Transcript;

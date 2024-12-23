import { extractChannelnumFromFilename } from "utils/transcript";
import { FunctionComponent, useRef, useEffect, useState } from "react";
import styles from "./transcript.module.css";
import { useClockContext } from "context/clockContext";
import { appSecondsFromTimeStr } from "utils/time";

const Transcript: FunctionComponent<{
  viewDate: string;
  transcriptItems: TranscriptItem[];
}> = ({ viewDate, transcriptItems }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL;
  const { clock, setClock } = useClockContext();
  const [lastScrolledToTimeStr, setLastScrolledToTimeStr] = useState<string | null>(null);

  useEffect(() => {
    if (!clock.appSeconds) return;

    // Find the closest transcript item to the current time
    let closestTranscript = transcriptItems[0];
    let appSecondsDiff = null;
    for (const item of transcriptItems) {
      const itemSeconds = appSecondsFromTimeStr(item.utteranceTime);
      if (itemSeconds > clock.appSeconds) {
        break;
      }
      const diff = Math.abs(clock.appSeconds - itemSeconds);
      if (appSecondsDiff === null || diff < appSecondsDiff) {
        appSecondsDiff = diff;
        closestTranscript = item;
      }
    }

    const closestTranscriptTimeStr = closestTranscript.utteranceTime;

    if (lastScrolledToTimeStr === closestTranscriptTimeStr) return;
    setLastScrolledToTimeStr(closestTranscriptTimeStr);

    const targetElement = document.querySelector(`[data-time="${closestTranscriptTimeStr}"]`);
    targetElement?.scrollIntoView({ behavior: "smooth" });

    // Play the audio
    const [year, month, day] = viewDate.split("-");
    const aacFileUrl = `${baseStaticUrl}/comm/${year}/${month}/${day}/${closestTranscript.filename}`;
    if (audioRef.current) {
      audioRef.current.src = aacFileUrl;
      audioRef.current.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clock.appSeconds,
    transcriptItems,
    audioRef,
    setLastScrolledToTimeStr,
    lastScrolledToTimeStr,
  ]);

  return (
    <div className={styles.transcriptsContainer}>
      <div className={styles.audioPlayer}>
        <audio ref={audioRef} controls>
          <track src="" kind="captions" label="English" />
          Your browser does not support the audio element.
        </audio>
      </div>
      <div className={styles.transcripts}>
        {transcriptItems.map((item, index) => {
          const channelnum = extractChannelnumFromFilename(item.filename);

          return (
            <div
              key={index}
              className={styles.transcriptItem}
              data-time={item.utteranceTime}
              role="button"
              tabIndex={0}
              onClick={() => {
                setLastScrolledToTimeStr(null);
                setClock((prev) => ({
                  ...prev,
                  appSeconds: appSecondsFromTimeStr(item.utteranceTime),
                }));
              }}
              onKeyDown={() => {
                setLastScrolledToTimeStr(null);
                setClock((prev) => ({
                  ...prev,
                  appSeconds: appSecondsFromTimeStr(item.utteranceTime),
                }));
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
    </div>
  );
};

export default Transcript;

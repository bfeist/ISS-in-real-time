import { extractChannelnumFromFilename } from "utils/transcript";
import { FunctionComponent, useEffect, useState } from "react";
import styles from "./transcript.module.css";
import { useClockContext } from "context/clockContext";
import { appSecondsFromTimeStr } from "utils/time";

const Transcript: FunctionComponent<{
  viewDate: string;
  transcriptItems: TranscriptItem[];
  audioRef: React.RefObject<HTMLAudioElement>;
}> = ({ viewDate, transcriptItems, audioRef }) => {
  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL;
  const { clock, setClock } = useClockContext();
  const [lastScrolledToTimeStr, setLastScrolledToTimeStr] = useState<string | null>(null);

  const getClosestTranscriptItem = () => {
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
    return closestTranscript;
  };

  /**
   * Effect to scroll to the closest transcript item when the clock changes
   */
  useEffect(() => {
    if (!clock.appSeconds || transcriptItems.length === 0) return;

    // If the clock isn't running, stop the audio
    if (!clock.isRunning && audioRef.current) {
      audioRef.current.pause();
    }

    const closestTranscript = getClosestTranscriptItem();

    const closestTranscriptTimeStr = closestTranscript.utteranceTime;

    if (lastScrolledToTimeStr === closestTranscriptTimeStr) return;
    setLastScrolledToTimeStr(closestTranscriptTimeStr);

    const targetElement = document.querySelector(`[data-time="${closestTranscriptTimeStr}"]`);
    targetElement?.scrollIntoView({ behavior: "smooth" });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, transcriptItems, audioRef, setLastScrolledToTimeStr, lastScrolledToTimeStr]);

  /**
   *  effect to play audio if clock.appSeconds === one of the transcriptItems
   */
  useEffect(() => {
    if (!clock.appSeconds || transcriptItems.length === 0) return;

    // Find a transcript item that matches the current time
    const transcriptItem = transcriptItems.find(
      (item) => appSecondsFromTimeStr(item.utteranceTime) === clock.appSeconds
    );

    if (transcriptItem) {
      const [year, month, day] = viewDate.split("-");
      const aacFileUrl = `${baseStaticUrl}/comm/${year}/${month}/${day}/${transcriptItem.filename}`;
      if (audioRef.current && clock.isRunning) {
        audioRef.current.src = aacFileUrl;
        audioRef.current.play();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, transcriptItems, audioRef, viewDate]);

  return (
    <div className={styles.transcript}>
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
  );
};

export default Transcript;

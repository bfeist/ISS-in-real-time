import { extractChannelInfoFromFilename } from "utils/comm";
import { FunctionComponent, useEffect, useRef, useState } from "react";
import styles from "./comm.module.css";
import { useClockState, useSelectedDateState } from "store";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";
import { useCommTranscript } from "../hooks/useDatePageData";

const Comm: FunctionComponent<{ showComm: boolean }> = ({ showComm }) => {
  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL.replace("\\x3a", ":");
  const { isRunning, setClock } = useClockState();
  const { selectedDate } = useSelectedDateState();

  const { data: commItems = [], isLoading, error } = useCommTranscript(selectedDate);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [lastScrolledToTimeStr, setLastScrolledToTimeStr] = useState<string | null>(null);
  const [appSeconds, setAppSeconds] = useState(0);

  const getClosestCommItem = () => {
    // Find the closest comm item to the current time
    let closestComm = commItems[0];
    let appSecondsDiff = null;
    for (const item of commItems) {
      const itemSeconds = appSecondsFromTimeStr(item.utteranceTime);
      if (itemSeconds > appSeconds) {
        break;
      }
      const diff = Math.abs(appSeconds - itemSeconds);
      if (appSecondsDiff === null || diff < appSecondsDiff) {
        appSecondsDiff = diff;
        closestComm = item;
      }
    }
    return closestComm;
  };
  /**
   * Effect to scroll to the closest comm item when the clock changes
   */
  useEffect(() => {
    if (!appSeconds || commItems.length === 0) return;

    // If the clock isn't running, stop the audio
    if (!isRunning && audioRef.current) {
      audioRef.current.pause();
    }

    const closestComm = getClosestCommItem();

    const closestCommTimeStr = closestComm.utteranceTime;

    if (lastScrolledToTimeStr === closestCommTimeStr) return;
    setLastScrolledToTimeStr(closestCommTimeStr);

    const targetElement = document.querySelector(`[data-time="${closestCommTimeStr}"]`);
    targetElement?.scrollIntoView({ behavior: "smooth" });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSeconds, commItems, audioRef, setLastScrolledToTimeStr, lastScrolledToTimeStr]);
  /**
   *  effect to play audio if appSeconds === one of the commItems
   */
  useEffect(() => {
    if (!appSeconds || commItems.length === 0) return;

    // Find a comm item that matches the current time
    const commItem = commItems.find(
      (item) => appSecondsFromTimeStr(item.utteranceTime) === appSeconds
    );

    if (commItem) {
      const [year, month, day] = selectedDate.split("-");
      const aacFileUrl = `${baseStaticUrl}/comm/${year}/${month}/${day}/${commItem.filename}`;
      if (audioRef.current && isRunning) {
        audioRef.current.src = aacFileUrl;
        audioRef.current.play();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSeconds, commItems, audioRef, selectedDate]);
  if (!showComm) {
    return (
      <div className={styles.comm}>
        <div className={styles.commItem}>
          <div>Communication transcripts are unavailable for this date</div>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.comm}>
      <ClockInterval setAppSeconds={setAppSeconds} />

      <div className={styles.audioPlayer}>
        <audio ref={audioRef} controls muted={false}>
          <track src="" kind="captions" label="English" />
          Your browser does not support the audio element.
        </audio>
      </div>

      {isLoading && <div className={styles.commItem}>Loading communication transcripts...</div>}

      {error && (
        <div className={styles.commItem}>
          Error loading communication transcripts: {error.message || "Unknown error"}
        </div>
      )}

      {!isLoading &&
        !error &&
        commItems.map((item, index) => {
          const channelInfo = extractChannelInfoFromFilename(item.filename);

          let commItemActive = null;
          const startAppSeconds = appSecondsFromTimeStr(item.utteranceTime);
          const endAppSeconds = appSecondsFromTimeStr(item.utteranceTime) + parseFloat(item.end);
          if (appSeconds >= startAppSeconds && appSeconds <= endAppSeconds) {
            commItemActive = styles.commItemActive;
          }

          return (
            <div
              key={index}
              className={`${styles.commItem} ${commItemActive}`}
              data-time={item.utteranceTime}
              role="button"
              tabIndex={0}
              onClick={() => {
                setLastScrolledToTimeStr(null);
                setClock(appSecondsFromTimeStr(item.utteranceTime));
              }}
              onKeyDown={() => {
                setLastScrolledToTimeStr(null);
                setClock(appSecondsFromTimeStr(item.utteranceTime));
              }}
            >
              <div>{item.utteranceTime}</div>
              <div className={styles.channelnum}>
                {channelInfo.type}-{channelInfo.number}
              </div>
              <div className={styles.textContainer}>
                <div>{item.text}</div>
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

export default Comm;

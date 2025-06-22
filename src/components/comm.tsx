import { extractChannelInfoFromFilename } from "utils/comm";
import { FunctionComponent, useCallback, useEffect, useRef, useState } from "react";
import styles from "./comm.module.css";
import { useStateClock, useStateSelectedDate, useStateToggle } from "store";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";
import { useDateCommTranscript, useDateDataAvailability } from "../api/useDateSpecificData";

const Comm: FunctionComponent<{ showComm: boolean }> = ({ showComm }) => {
  const { isRunning, setClock } = useStateClock();
  const { selectedDate } = useStateSelectedDate();
  const { globalMute } = useStateToggle();

  const { data: dataAvailability, isLoading: isDataAvailabilityLoading } =
    useDateDataAvailability(selectedDate);
  const { data: commItems = [], isLoading, error } = useDateCommTranscript(selectedDate);

  const audioRefCh1 = useRef<HTMLAudioElement | null>(null);
  const audioRefCh2 = useRef<HTMLAudioElement | null>(null);
  const audioRefCh3 = useRef<HTMLAudioElement | null>(null);
  const audioRefCh4 = useRef<HTMLAudioElement | null>(null);
  const audioRefCh5 = useRef<HTMLAudioElement | null>(null);

  const [lastScrolledToTimeStr, setLastScrolledToTimeStr] = useState<string | null>(null);
  const [appSeconds, setAppSeconds] = useState(0);

  const getClosestCommItem = useCallback(() => {
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
  }, [appSeconds, commItems]);

  /**
   * Effect to set the clock to the first comm item when the component mounts
   */
  useEffect(() => {
    if (!commItems.length || !dataAvailability) return;

    // If YouTube data is available, we don't set the clock to the first comm item
    if (dataAvailability.youtube) return;

    const firstComm = commItems[0];
    setClock(appSecondsFromTimeStr(firstComm.utteranceTime) - 10); // Start 10 seconds before the first comm item
  }, [commItems, setClock, dataAvailability]);

  /**
   * Effect to scroll to the closest comm item when the clock changes
   */
  useEffect(() => {
    if (!appSeconds || commItems.length === 0) return;

    const closestComm = getClosestCommItem();
    const closestCommTimeStr = closestComm.utteranceTime;

    if (lastScrolledToTimeStr === closestCommTimeStr) return;
    setLastScrolledToTimeStr(closestCommTimeStr);

    const targetElement = document.querySelector(`[data-time="${closestCommTimeStr}"]`);
    targetElement?.scrollIntoView({ behavior: "smooth" });
  }, [
    appSeconds,
    commItems,
    audioRefCh1,
    setLastScrolledToTimeStr,
    lastScrolledToTimeStr,
    getClosestCommItem,
  ]);

  /**
   *  effect to play audio if appSeconds === one of the commItems
   */
  useEffect(() => {
    if (!appSeconds || commItems.length === 0) return;

    const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL.replace("\\x3a", ":");

    // If the clock isn't running, stop the audio
    if (!isRunning) {
      if (audioRefCh1.current) {
        audioRefCh1.current.pause();
      }
      if (audioRefCh2.current) {
        audioRefCh2.current.pause();
      }
      if (audioRefCh3.current) {
        audioRefCh3.current.pause();
      }
      if (audioRefCh4.current) {
        audioRefCh4.current.pause();
      }
      if (audioRefCh5.current) {
        audioRefCh5.current.pause();
      }
    }

    // Find a comm item that matches the current time
    const commItem = commItems.find(
      (item) => appSecondsFromTimeStr(item.utteranceTime) === appSeconds
    );

    if (commItem) {
      const [year, month, day] = selectedDate.split("-");
      const aacFileUrl = `${baseStaticUrl}/comm/${year}/${month}/${day}/${commItem.filename}`;

      // if SG1, play on channel 1 etc. Don't worry about overlapping audio playing. This is what happens in real life.
      if (commItem.filename.includes("SG_1")) {
        if (audioRefCh1.current && isRunning) {
          audioRefCh1.current.src = aacFileUrl;
          audioRefCh1.current.play();
        }
      } else if (commItem.filename.includes("SG_2")) {
        if (audioRefCh2.current && isRunning) {
          audioRefCh2.current.src = aacFileUrl;
          audioRefCh2.current.play();
        }
      } else if (commItem.filename.includes("SG_3")) {
        if (audioRefCh3.current && isRunning) {
          audioRefCh3.current.src = aacFileUrl;
          audioRefCh3.current.play();
        }
      } else if (commItem.filename.includes("SG_4")) {
        if (audioRefCh4.current && isRunning) {
          audioRefCh4.current.src = aacFileUrl;
          audioRefCh4.current.play();
        }
      } else {
        if (audioRefCh5.current && isRunning) {
          audioRefCh5.current.src = aacFileUrl;
          audioRefCh5.current.play();
        }
      }
    }
  }, [appSeconds, commItems, audioRefCh1, selectedDate, isRunning]);

  if (!showComm) {
    return (
      <div className={styles.comm}>
        <div className={styles.commItem}>
          <div>Communications audio and transcripts are unavailable for this date</div>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.comm}>
      <ClockInterval setAppSeconds={setAppSeconds} />

      <div className={styles.audioPlayer}>
        <audio ref={audioRefCh1} controls muted={globalMute}>
          <track src="" kind="captions" label="English" />
          Your browser does not support the audio element.
        </audio>
      </div>
      <div className={styles.audioPlayer}>
        <audio ref={audioRefCh2} controls muted={globalMute}>
          <track src="" kind="captions" label="English" />
          Your browser does not support the audio element.
        </audio>
      </div>
      <div className={styles.audioPlayer}>
        <audio ref={audioRefCh3} controls muted={globalMute}>
          <track src="" kind="captions" label="English" />
          Your browser does not support the audio element.
        </audio>
      </div>
      <div className={styles.audioPlayer}>
        <audio ref={audioRefCh4} controls muted={globalMute}>
          <track src="" kind="captions" label="English" />
          Your browser does not support the audio element.
        </audio>
      </div>
      <div className={styles.audioPlayer}>
        <audio ref={audioRefCh5} controls muted={globalMute}>
          <track src="" kind="captions" label="English" />
          Your browser does not support the audio element.
        </audio>
      </div>

      {(isLoading || isDataAvailabilityLoading) && (
        <div className={styles.commItem}>Loading communication transcripts...</div>
      )}

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

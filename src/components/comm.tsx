import { extractChannelInfoFromFilename } from "utils/comm";
import { FunctionComponent, useEffect, useState } from "react";
import styles from "./comm.module.css";
import { useClockContext } from "context/clockContext";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";

const Comm: FunctionComponent<{
  viewDate: string;
  commItems: CommItem[];
  audioRef: React.RefObject<HTMLAudioElement>;
}> = ({ viewDate, commItems, audioRef }) => {
  const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL.replace("\\x3a", ":");
  const { clock, clockDispatch } = useClockContext();
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
    if (!clock.isRunning && audioRef.current) {
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
      const [year, month, day] = viewDate.split("-");
      const aacFileUrl = `${baseStaticUrl}/comm/${year}/${month}/${day}/${commItem.filename}`;
      if (audioRef.current && clock.isRunning) {
        audioRef.current.src = aacFileUrl;
        audioRef.current.play();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSeconds, commItems, audioRef, viewDate]);

  return (
    <div className={styles.comm}>
      <ClockInterval setAppSeconds={setAppSeconds} />
      {commItems.map((item, index) => {
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
              clockDispatch({
                type: "setAppSeconds",
                appSeconds: appSecondsFromTimeStr(item.utteranceTime),
              });
            }}
            onKeyDown={() => {
              setLastScrolledToTimeStr(null);
              clockDispatch({
                type: "setAppSeconds",
                appSeconds: appSecondsFromTimeStr(item.utteranceTime),
              });
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

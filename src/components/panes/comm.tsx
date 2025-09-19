import { extractChannelInfoFromFilename } from "utils/comm";
import { FunctionComponent, useCallback, useEffect, useRef, useState } from "react";
import styles from "./comm.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateToggle } from "store/hooks/useStateToggle";
import { appSecondsFromTimeStr } from "utils/time";
import ClockInterval from "./clockInterval";
import { useDateCommTranscript, useDateDataAvailability } from "../../api/useDateSpecificData";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faVolumeHigh, faVolumeMute, faArrowsSpin } from "@fortawesome/free-solid-svg-icons";

// Explicitly reference dynamic CSS classes to prevent linter warnings
// @ts-ignore - Used to prevent unused CSS class warnings
const _unusedClasses = [
  styles.channelToggle1Active,
  styles.channelToggle1Inactive,
  styles.channelToggle2Active,
  styles.channelToggle2Inactive,
  styles.channelToggle3Active,
  styles.channelToggle3Inactive,
  styles.channelToggle4Active,
  styles.channelToggle4Inactive,
  styles.channelToggle5Active,
  styles.channelToggle5Inactive,
  styles.channelToggleDisabled,
  styles.channelnum1,
  styles.channelnum2,
  styles.channelnum3,
  styles.channelnum4,
  styles.channelnum5,
];

const Comm: FunctionComponent = () => {
  const { isRunning, setClock, selectedDate } = useStateClock();
  const { globalMute } = useStateToggle();

  const { isLoading: isDataAvailabilityLoading } = useDateDataAvailability(selectedDate);
  const { data: commItems = [], isLoading, error } = useDateCommTranscript(selectedDate);

  const audioRefCh1 = useRef<HTMLAudioElement | null>(null);
  const audioRefCh2 = useRef<HTMLAudioElement | null>(null);
  const audioRefCh3 = useRef<HTMLAudioElement | null>(null);
  const audioRefCh4 = useRef<HTMLAudioElement | null>(null);
  const audioRefCh5 = useRef<HTMLAudioElement | null>(null);

  const [lastScrolledToTimeStr, setLastScrolledToTimeStr] = useState<string | null>(null);
  const [appSeconds, setAppSeconds] = useState(0);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  // State to track which channels are visible
  const [channelVisibility, setChannelVisibility] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
  });

  // Refs for scroll management
  const commContentRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollingRef = useRef(false);
  const isPointerDownRef = useRef(false);

  // Function to check if a channel has communication data
  const getAvailableChannels = useCallback((): Set<number> => {
    const availableChannels = new Set<number>();

    commItems.forEach((item) => {
      const channelInfo = extractChannelInfoFromFilename(item.filename);
      if (channelInfo) {
        availableChannels.add(channelInfo.routingChannel);
      }
    });

    return availableChannels;
  }, [commItems]);

  const availableChannels = getAvailableChannels();

  // Function to determine what channel 5 toggle should display (DG-1 or AG-1)
  const getChannel5DisplayName = useCallback((): string => {
    let hasDG = false;
    let hasAG = false;

    commItems.forEach((item) => {
      const channelInfo = extractChannelInfoFromFilename(item.filename);
      if (channelInfo && channelInfo.routingChannel === 5) {
        if (channelInfo.type === "DG") {
          hasDG = true;
        } else if (channelInfo.type === "AG") {
          hasAG = true;
        }
      }
    });

    // DG-1 takes priority, fall back to AG-1, or default to DG-1
    if (hasDG) {
      return "DG-1";
    } else if (hasAG) {
      return "AG-1";
    } else {
      return "DG-1";
    }
  }, [commItems]);

  // Function to toggle channel visibility
  const toggleChannel = (channelNumber: number) => {
    // Don't allow toggling if the channel has no data
    if (!availableChannels.has(channelNumber)) {
      return;
    }

    setChannelVisibility((prev) => ({
      ...prev,
      [channelNumber]: !prev[channelNumber],
    }));
  };

  const getClosestCommItem = useCallback(() => {
    // Find the closest comm item to the current time from visible channels
    const visibleCommItems = commItems.filter((item) => {
      const channelInfo = extractChannelInfoFromFilename(item.filename);
      return channelInfo && channelVisibility[channelInfo.routingChannel];
    });

    let closestComm = visibleCommItems[0];
    let appSecondsDiff = null;
    for (const item of visibleCommItems) {
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
  }, [appSeconds, commItems, channelVisibility]);

  const scrollToCurrentCommItem = useCallback(() => {
    if (appSeconds && commItems.length > 0) {
      const closestComm = getClosestCommItem();
      const closestCommTimeStr = closestComm.utteranceTime;
      const targetElement = document.querySelector(`[data-time="${closestCommTimeStr}"]`);
      if (targetElement) {
        isProgrammaticScrollingRef.current = true;
        targetElement.scrollIntoView({ behavior: "smooth" });
        setTimeout(() => {
          isProgrammaticScrollingRef.current = false;
        }, 100);
      }
      setLastScrolledToTimeStr(closestCommTimeStr);
    }
  }, [appSeconds, commItems, getClosestCommItem]);

  // Handle scroll event detection
  useEffect(() => {
    const container = commContentRef.current;
    if (!container) return;

    const handleManualScroll = () => {
      if (isAutoScrollEnabled && !isProgrammaticScrollingRef.current) {
        console.log("Disabling auto-scroll due to manual scroll");
        setIsAutoScrollEnabled(false);
      }
    };

    const handleScroll = () => {
      if (isPointerDownRef.current) {
        handleManualScroll();
      }
    };

    const handleWheel = () => {
      handleManualScroll();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) {
        handleManualScroll();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      // Only set pointer down if not clicking on a comm item
      if (!(e.target as Element).closest(`.${styles.commItem}`)) {
        isPointerDownRef.current = true;
      }
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("keydown", handleKeyDown);
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointerup", handlePointerUp);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("keydown", handleKeyDown);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isAutoScrollEnabled]);

  /**
   * Effect to scroll to the closest comm item when the clock changes
   */
  useEffect(() => {
    if (!appSeconds || commItems.length === 0) return;

    const closestComm = getClosestCommItem();
    const closestCommTimeStr = closestComm.utteranceTime;

    if (lastScrolledToTimeStr === closestCommTimeStr) return;

    // Only auto-scroll if enabled
    if (isAutoScrollEnabled) {
      scrollToCurrentCommItem();
    } else {
      setLastScrolledToTimeStr(closestCommTimeStr);
    }
  }, [
    appSeconds,
    commItems,
    audioRefCh1,
    lastScrolledToTimeStr,
    getClosestCommItem,
    isAutoScrollEnabled,
    scrollToCurrentCommItem,
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

    // Find ALL comm items that match the current time (there can be multiple with same timestamp)
    const commItemsAtCurrentTime = commItems.filter(
      (item) => appSecondsFromTimeStr(item.utteranceTime) === appSeconds
    );

    // Play audio for each comm item that matches the current time
    commItemsAtCurrentTime.forEach((commItem) => {
      const [year, month, day] = selectedDate.split("-");
      const aacFileUrl = `${baseStaticUrl}/comm/${year}/${month}/${day}/${commItem.filename}`;

      // if SG1, play on channel 1 etc. Don't worry about overlapping audio playing. This is what happens in real life.
      if (commItem.filename.includes("SG_1")) {
        if (audioRefCh1.current && isRunning && channelVisibility[1]) {
          audioRefCh1.current.src = aacFileUrl;
          audioRefCh1.current.play();
        }
      } else if (commItem.filename.includes("SG_2")) {
        if (audioRefCh2.current && isRunning && channelVisibility[2]) {
          audioRefCh2.current.src = aacFileUrl;
          audioRefCh2.current.play();
        }
      } else if (commItem.filename.includes("SG_3")) {
        if (audioRefCh3.current && isRunning && channelVisibility[3]) {
          audioRefCh3.current.src = aacFileUrl;
          audioRefCh3.current.play();
        }
      } else if (commItem.filename.includes("SG_4")) {
        if (audioRefCh4.current && isRunning && channelVisibility[4]) {
          audioRefCh4.current.src = aacFileUrl;
          audioRefCh4.current.play();
        }
      } else if (commItem.filename.includes("DG") || commItem.filename.includes("AG")) {
        // SG5 channel should match any DG or AG communications
        if (audioRefCh5.current && isRunning && channelVisibility[5]) {
          audioRefCh5.current.src = aacFileUrl;
          audioRefCh5.current.play();
        }
      } else {
        if (audioRefCh5.current && isRunning && channelVisibility[5]) {
          audioRefCh5.current.src = aacFileUrl;
          audioRefCh5.current.play();
        }
      }
    });
  }, [appSeconds, commItems, audioRefCh1, selectedDate, isRunning, channelVisibility]);

  return (
    <div className={styles.comm}>
      <ClockInterval setAppSeconds={setAppSeconds} />

      {/* Channel toggle buttons */}
      <div className={styles.channelToggleContainer}>
        {[1, 2, 3, 4, 5].map((channelNum) => {
          const isChannelAvailable = availableChannels.has(channelNum);
          const isChannelVisible = channelVisibility[channelNum];

          // Get display name for channel 5, otherwise use SG-{channelNum}
          const channelDisplayName =
            channelNum === 5 ? getChannel5DisplayName() : `SG-${channelNum}`;

          let toggleClassName;
          if (!isChannelAvailable) {
            toggleClassName = styles.channelToggleDisabled;
          } else if (isChannelVisible) {
            toggleClassName = styles[`channelToggle${channelNum}Active`];
          } else {
            toggleClassName = styles[`channelToggle${channelNum}Inactive`];
          }

          let toggleIcon;
          if (!isChannelAvailable) {
            toggleIcon = faVolumeMute;
          } else if (isChannelVisible) {
            toggleIcon = faVolumeHigh;
          } else {
            toggleIcon = faVolumeMute;
          }

          return (
            <div
              key={channelNum}
              className={`${styles.channelToggle} ${toggleClassName}`}
              role="button"
              tabIndex={isChannelAvailable ? 0 : -1}
              onClick={() => toggleChannel(channelNum)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleChannel(channelNum);
                }
              }}
              aria-pressed={isChannelVisible}
              aria-disabled={!isChannelAvailable}
              aria-label={`Toggle ${channelDisplayName} channel ${
                !isChannelAvailable ? "(no data available)" : isChannelVisible ? "off" : "on"
              }`}
            >
              {channelDisplayName}
              <FontAwesomeIcon icon={toggleIcon} className={styles.channelToggleIcon} />
            </div>
          );
        })}
      </div>

      <div className={styles.commContent} ref={commContentRef}>
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
          commItems
            .filter((item) => {
              const channelInfo = extractChannelInfoFromFilename(item.filename);
              if (!channelInfo) return false;
              return channelVisibility[channelInfo.routingChannel];
            })
            .map((item) => {
              const channelInfo = extractChannelInfoFromFilename(item.filename);

              let commItemActive = null;
              const startAppSeconds = appSecondsFromTimeStr(item.utteranceTime);
              const endAppSeconds =
                appSecondsFromTimeStr(item.utteranceTime) + parseFloat(item.end);
              if (appSeconds >= startAppSeconds && appSeconds <= endAppSeconds) {
                commItemActive = styles.commItemActive;
              }

              // Display original channel info (DG-1, AG-1, etc.) but route to appropriate channel
              const displayChannel = `${channelInfo.displayType}-${channelInfo.displayNumber}`;
              const channelNumClass = styles[`channelnum${channelInfo.routingChannel}`];

              return (
                <div
                  key={`${item.utteranceTime}-${item.filename}`}
                  className={`${styles.commItem} ${commItemActive}`}
                  data-time={item.utteranceTime}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setLastScrolledToTimeStr(null);
                    setClock(appSecondsFromTimeStr(item.utteranceTime));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setLastScrolledToTimeStr(null);
                      setClock(appSecondsFromTimeStr(item.utteranceTime));
                    }
                  }}
                  aria-label={`Jump to communication at ${item.utteranceTime}`}
                >
                  <div className={styles.commTime}>{item.utteranceTime}</div>
                  <div className={`${styles.channelnum} ${channelNumClass}`}>{displayChannel}</div>
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
      {!isAutoScrollEnabled && (
        <button
          className={styles.autoScrollButton}
          onClick={() => {
            setIsAutoScrollEnabled(true);
            scrollToCurrentCommItem();
          }}
          type="button"
          data-tooltip-id="source-button-tooltip"
          data-tooltip-content={"Re-enable automatic scrolling"}
          data-tooltip-place="left"
        >
          <FontAwesomeIcon icon={faArrowsSpin} />
        </button>
      )}
    </div>
  );
};

export default Comm;

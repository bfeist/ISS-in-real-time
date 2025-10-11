import { FunctionComponent, useState, useEffect } from "react";
import styles from "./header.module.css";
import { useStateToggle } from "../../store/hooks/useStateToggle";
import ShareButton from "components/header/share";
import AboutModal from "components/header/about";
import { useStateClock } from "store/hooks/useStateClock";
import ClockInterval from "components/panes/clockInterval";
import IconButton from "components/common/iconButton";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";

const Header: FunctionComponent = () => {
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();
  const { selectedDate, setDateOnly } = useStateClock();

  const [appSeconds, setAppSeconds] = useState(0);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(() => {
    if (typeof window === "undefined") {
      return 1024;
    }
    return window.innerWidth;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const showAboutLabel = windowWidth >= 525;

  return (
    <>
      <ClockInterval setAppSeconds={setAppSeconds} />
      <div
        className={styles.header}
        onClick={() => setShowTimelineYears(!showTimelineYears)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setShowTimelineYears(!showTimelineYears);
            e.preventDefault();
          }
        }}
      >
        <div className={styles.left}>
          <div className={styles.titleContainer}>
            <img src="/images/header/ISS_logo.png" alt="ISS Logo" className={styles.logo} />
            <div
              className={styles.title}
              onClick={(e) => {
                setDateOnly(null);
                e.stopPropagation();
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setDateOnly(null);
                  e.preventDefault();
                }
              }}
            >
              ISS in Real Time
            </div>
            <div className={styles.blurb}>
              A real-time journey onboard the International Space Station
            </div>
          </div>
        </div>
        <div className={styles.right}>
          <div className={styles.rightButtons}>
            <IconButton
              icon={faInfoCircle}
              label={showAboutLabel ? "About this project" : undefined}
              style={{ width: showAboutLabel ? "130px" : undefined, fontSize: "0.7rem" }}
              onClick={(e) => {
                setIsAboutModalOpen(true);
                e.stopPropagation();
              }}
            />
            <ShareButton
              selectedDate={selectedDate}
              appSeconds={appSeconds}
              windowWidth={windowWidth}
            />
          </div>
        </div>
      </div>
      <AboutModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} />
    </>
  );
};

export default Header;

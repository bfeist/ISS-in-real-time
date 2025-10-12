import { FunctionComponent, useState, useEffect, useMemo } from "react";
import styles from "./header.module.css";
import { useStateToggle } from "../../store/hooks/useStateToggle";
import AboutModal from "components/header/about";
import { useStateClock } from "store/hooks/useStateClock";
import ClockInterval from "components/panes/clockInterval";
import IconButton from "components/common/iconButton";
import {
  faInfoCircle,
  faTriangleExclamation,
  faShareNodes,
} from "@fortawesome/free-solid-svg-icons";
import NoDataWarningModal from "components/header/noDataWarning";
import { useGeneralDataAvailabilities } from "api/useGeneralData";
import { getLastDateWithData } from "utils/dates";
import { generateShareUrl } from "utils/params";
import dayjs from "dayjs";
import ShareModal from "./share";

const Header: FunctionComponent = () => {
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();
  const { selectedDate, setDateOnly } = useStateClock();

  const [appSeconds, setAppSeconds] = useState(0);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isNoDataModalOpen, setIsNoDataModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
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

  const showButtonLabels = windowWidth > 590;
  const { data: dataAvailabilities } = useGeneralDataAvailabilities();

  const lastDateWithData = useMemo(
    () => getLastDateWithData(dataAvailabilities),
    [dataAvailabilities]
  );

  const showWarningButton = useMemo(() => {
    if (!selectedDate || !lastDateWithData) {
      return false;
    }

    const lastDay = dayjs(lastDateWithData).startOf("day");
    const comparisonDate = dayjs(selectedDate).startOf("day");

    if (!lastDay.isValid() || !comparisonDate.isValid()) {
      return false;
    }

    return comparisonDate.isAfter(lastDay);
  }, [lastDateWithData, selectedDate]);

  const shareUrl = useMemo(
    () => generateShareUrl(selectedDate, appSeconds),
    [selectedDate, appSeconds]
  );

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
            {showWarningButton && (
              <IconButton
                icon={faTriangleExclamation}
                label={showButtonLabels ? "Data Status" : undefined}
                tooltipContent="Data Status"
                tooltipPlace="bottom"
                className={styles.dataWarningButton}
                style={{ width: showButtonLabels ? "95px" : undefined, fontSize: "0.7rem" }}
                onClick={(e) => {
                  setIsNoDataModalOpen(true);
                  e.stopPropagation();
                }}
              />
            )}
            <IconButton
              icon={faInfoCircle}
              label={showButtonLabels ? "About this project" : undefined}
              style={{ width: showButtonLabels ? "130px" : undefined, fontSize: "0.7rem" }}
              onClick={(e) => {
                setIsAboutModalOpen(true);
                e.stopPropagation();
              }}
            />
            <IconButton
              icon={faShareNodes}
              label={showButtonLabels ? "Share" : undefined}
              style={{ width: showButtonLabels ? "68px" : undefined, fontSize: "0.7rem" }}
              onClick={(event) => {
                setIsShareModalOpen(true);
                event.stopPropagation();
              }}
              aria-label="Create shareable link of this moment"
            />
          </div>
        </div>
      </div>
      <AboutModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} />
      <NoDataWarningModal isOpen={isNoDataModalOpen} onClose={() => setIsNoDataModalOpen(false)} />
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        shareUrl={shareUrl}
        hasSelectedDate={!!selectedDate}
      />
    </>
  );
};

export default Header;

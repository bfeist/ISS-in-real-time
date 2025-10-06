import { FunctionComponent, JSX, useState, useEffect } from "react";
import StatsModal from "./statsModal";
import DayCounter from "./dayCounter";
import StatsCallout from "./statsCallout";
import styles from "./noDateSelected.module.css";
import { useStateToggle } from "store/hooks/useStateToggle";
import { useGeneralStats } from "api/useGeneralData";

const images = [
  "/images/backgrounds/iss_moon_big.jpg",
  "/images/backgrounds/The_International_Space_Station_with_ATV-2_and_Endeavour.jpg",
  "/images/backgrounds/iss_rotated.png",
  "/images/backgrounds/S106E5331_big.jpg",
];

const NoDateSelected: FunctionComponent = (): JSX.Element => {
  const { setShowTimelineYears } = useStateToggle();
  const { data: stats, isLoading, error } = useGeneralStats();

  const [showStats, setShowStats] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 7000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.backgroundCarousel}>
        {images.map((imageSrc, index) => (
          <div
            key={imageSrc}
            className={`${styles.backgroundImage} ${
              index === currentImageIndex ? styles.active : ""
            }`}
            style={{ backgroundImage: `url(${imageSrc})` }}
          />
        ))}
      </div>
      <div className={styles.pageContent}>
        <div className={styles.headerContent}>
          <h2>
            Explore 25 years onboard the{" "}
            <span className={styles.breakSpan}>International Space Station</span>
          </h2>

          <p>
            This multimedia project replays every day of the past 25 years onboard and consists
            entirely of historical mission material.
          </p>
        </div>
        <div
          className={styles.exploreButton}
          onClick={() => {
            setShowTimelineYears(true);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setShowTimelineYears(true);
              e.preventDefault();
            }
          }}
        >
          Explore
        </div>
        <DayCounter />
        <StatsCallout
          stats={stats}
          isLoading={isLoading}
          error={error}
          onShowStats={() => setShowStats(true)}
        />

        <div className={styles.forumCallout}>
          Visit the{" "}
          <a href="https://forum.apolloinrealtime.org" target="_blank" rel="noopener noreferrer">
            Real Time Discussion Forum
          </a>
        </div>
      </div>
      <StatsModal isOpen={showStats} onClose={() => setShowStats(false)} />
    </div>
  );
};

export default NoDateSelected;

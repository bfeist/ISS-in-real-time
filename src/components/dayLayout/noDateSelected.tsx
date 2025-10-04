import { FunctionComponent, JSX, useState, useEffect } from "react";
import StatsModal from "./statsModal";
import DayCounter from "./dayCounter";
import StatsCallout from "./statsCallout";
import styles from "./noDateSelected.module.css";
import { useStateToggle } from "store/hooks/useStateToggle";
import { useGeneralStats } from "api/useGeneralData";

const NoDateSelected: FunctionComponent = (): JSX.Element => {
  const { setShowTimelineYears } = useStateToggle();
  const { data: stats, isLoading, error } = useGeneralStats();

  const [showStats, setShowStats] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState("");
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    const images = ["/images/backgrounds/iss_moon_big.jpg", "/images/backgrounds/iss_rotated.png"];
    const randomImage = images[Math.floor(Math.random() * images.length)];
    setBackgroundImage(randomImage);

    const img = new Image();
    img.src = randomImage;
    img.onload = () => setImageLoaded(true);
  }, []);

  return (
    <div
      className={styles.container}
      style={{ backgroundImage: `url(${backgroundImage})`, opacity: imageLoaded ? 1 : 0 }}
    >
      <div className={styles.pageContent}>
        <div className={styles.headerContent}>
          <h2>Re-live Every Day Onboard the International Space Station</h2>

          <p>This multimedia project consists entirely of original historical mission material.</p>
        </div>
        <DayCounter />
        <StatsCallout
          stats={stats}
          isLoading={isLoading}
          error={error}
          onShowStats={() => setShowStats(true)}
        />
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
      </div>
      <StatsModal isOpen={showStats} onClose={() => setShowStats(false)} />
    </div>
  );
};

export default NoDateSelected;

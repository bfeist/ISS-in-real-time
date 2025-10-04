import { FunctionComponent, JSX, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectFade } from "swiper/modules";
import "swiper/css";
import "swiper/css/effect-fade";
import StatsModal from "./statsModal";
import DayCounter from "./dayCounter";
import StatsCallout from "./statsCallout";
import styles from "./noDateSelected.module.css";
import { useStateToggle } from "store/hooks/useStateToggle";
import { useGeneralStats } from "api/useGeneralData";

const images = [
  "/images/backgrounds/iss_moon_big.jpg",
  "/images/backgrounds/iss_rotated.png",
  "/images/backgrounds/S106E5331_big.jpg",
];

const NoDateSelected: FunctionComponent = (): JSX.Element => {
  const { setShowTimelineYears } = useStateToggle();
  const { data: stats, isLoading, error } = useGeneralStats();

  const [showStats, setShowStats] = useState(false);

  return (
    <div className={styles.container}>
      <Swiper
        modules={[Autoplay, EffectFade]}
        effect="fade"
        fadeEffect={{
          crossFade: false,
        }}
        speed={1000}
        autoplay={{
          delay: 5000,
          disableOnInteraction: false,
        }}
        loop={true}
        className={styles.backgroundCarousel}
      >
        {images.map((imageSrc) => (
          <SwiperSlide key={imageSrc}>
            <img src={imageSrc} alt="" className={styles.backgroundImage} />
          </SwiperSlide>
        ))}
      </Swiper>
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

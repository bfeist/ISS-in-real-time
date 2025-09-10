import React, { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import styles from "./timelineYears2.module.css";
import { useStateToggle } from "../../store/hooks/useStateToggle";
import { useStateHover } from "../../store/hooks/useStateHover";
import SearchComponent from "./subcomponents/highlightData";
import YearCanvas, { COLORS } from "./subcomponents/YearCanvas";
import MegaYearOverlay from "./subcomponents/MegaYearOverlay";

// Configure dayjs to use UTC plugin
dayjs.extend(utc);

// Constants from the original HTML
const START_YEAR = 2000;
const END_YEAR = 2025;
const YEAR_GAP = "3px"; // done in css

// Props interface for the TimelineYears2 component
interface TimelineYears2Props {
  highlights: Map<string, { fill: string; stroke?: string }>;
  selectedDate: string | null;
  commFirstData?: Record<string, CommFirstItem>;
}

// Main TimelineYears2 component
const TimelineYears2: React.FC<TimelineYears2Props> = ({
  highlights,
  selectedDate,
  commFirstData,
}) => {
  // Global state hooks
  const { showTimelineYears } = useStateToggle();
  const { hoveredDate } = useStateHover();

  // State to force redraw when timeline becomes visible
  const [forceRedrawCounter, setForceRedrawCounter] = useState(0);

  // Container ref for tooltip positioning
  const containerRef = useRef<HTMLDivElement>(null);

  // Audio refs and state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Force redraw when timeline becomes visible
  useEffect(() => {
    if (showTimelineYears) {
      setForceRedrawCounter((prev) => prev + 1);
    }
  }, [showTimelineYears]);

  // Debounced audio playback when hoveredDate changes
  useEffect(() => {
    if (!hoveredDate || !commFirstData || !audioRef.current || !showTimelineYears) {
      return;
    }

    // Create a debounce timer
    const timer = setTimeout(() => {
      const audioData = commFirstData[hoveredDate];
      if (audioData && audioData.filename) {
        const audioElement = audioRef.current;
        if (audioElement) {
          // Parse the hovered date to get year, month, day
          const date = dayjs.utc(hoveredDate);
          const year = date.format("YYYY");
          const month = date.format("MM");
          const day = date.format("DD");

          // Construct the full URL for the audio file
          const baseStaticUrl = import.meta.env.VITE_BASE_STATIC_URL || "";
          const audioUrl = `${baseStaticUrl}/comm/${year}/${month}/${day}/${audioData.filename}`;

          // Stop any currently playing audio
          audioElement.pause();
          audioElement.currentTime = 0;

          // Set new source and play
          audioElement.src = audioUrl;

          // Only try to play if user has interacted with the page
          if (hasUserInteracted) {
            audioElement.play().catch((error) => {
              // Silently handle the error - this is expected behavior for hover audio
              if (error.name !== "NotAllowedError") {
                console.warn("Failed to play audio:", error);
              }
            });
          }
        }
      }
    }, 1000); // 1 second debounce

    // Cleanup function to clear the timer
    return () => {
      clearTimeout(timer);
    };
  }, [hoveredDate, commFirstData, hasUserInteracted, showTimelineYears]);

  // Track user interaction to enable audio playback
  useEffect(() => {
    const enableAudio = () => {
      setHasUserInteracted(true);
    };

    // Listen for various user interaction events
    document.addEventListener("click", enableAudio, { once: true });
    document.addEventListener("keydown", enableAudio, { once: true });
    document.addEventListener("touchstart", enableAudio, { once: true });

    return () => {
      document.removeEventListener("click", enableAudio);
      document.removeEventListener("keydown", enableAudio);
      document.removeEventListener("touchstart", enableAudio);
    };
  }, []);

  const [hoveredYearIndex, setHoveredYearIndex] = useState<number | null>(null);
  const [megaOverlayVisible, setMegaOverlayVisible] = useState(false);
  const [megaOverlayYear, setMegaOverlayYear] = useState<number | null>(null);
  const [megaOverlayPosition, setMegaOverlayPosition] = useState({ left: 0, top: 0, width: 0 });
  const [isOverMegaOverlay, setIsOverMegaOverlay] = useState(false);

  const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);
  const selectedYearEl = selectedDate ? new Date(selectedDate).getFullYear() : null;

  const handleYearHover = (yearIndex: number) => {
    setHoveredYearIndex(yearIndex);
    showMegaOverlay(yearIndex);
  };

  const handleYearLeave = () => {
    if (!isOverMegaOverlay) {
      setHoveredYearIndex(null);
      setMegaOverlayVisible(false);
    }
  };

  const handleMegaOverlayMouseEnter = () => {
    setIsOverMegaOverlay(true);
  };

  const handleMegaOverlayMouseLeave = () => {
    setIsOverMegaOverlay(false);
    setMegaOverlayVisible(false);
    setHoveredYearIndex(null);
  };

  const showMegaOverlay = (yearIndex: number) => {
    const year = years[yearIndex];

    if (!containerRef.current) return;

    // Find year elements by using a more generic selector since YearCanvas styles are in a separate module
    const yearElements = containerRef.current.querySelectorAll("[data-year-index]");
    const yearEl = yearElements[yearIndex] as HTMLElement;
    if (!yearEl) return;

    const yearsTimelineRect = containerRef.current.getBoundingClientRect();
    const yearRect = yearEl.getBoundingClientRect();

    // Position overlay to center on the year element - use 2x width
    const overlayWidth = yearRect.width * 2;
    const left = yearRect.left - yearsTimelineRect.left + yearRect.width / 2 - overlayWidth / 2;

    // Position overlay to start just below the year header, so the year title shows through
    const yearHeaderHeight = 25; // Height of the year header
    const top = yearRect.top - yearsTimelineRect.top + yearHeaderHeight;

    setMegaOverlayYear(year);
    setMegaOverlayPosition({ left, top, width: overlayWidth });
    setMegaOverlayVisible(true);
  };

  return (
    <>
      <div
        className={`${styles.yearsTimeline} ${!showTimelineYears ? styles.isCollapsed : ""}`}
        ref={containerRef}
        onMouseLeave={() => {
          // Stop audio playback when mouse leaves the container
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
        }}
      >
        <div className={styles.years} style={{ gap: YEAR_GAP }}>
          {years.map((year, index) => (
            <YearCanvas
              key={year}
              year={year}
              index={index}
              isActive={hoveredYearIndex === index}
              isSelected={selectedYearEl === year}
              highlights={highlights}
              onYearHover={handleYearHover}
              onYearLeave={handleYearLeave}
              forceRedraw={forceRedrawCounter}
            />
          ))}
        </div>
        <SearchComponent />

        {/* Mega Overlay */}
        {megaOverlayVisible && megaOverlayYear && (
          <MegaYearOverlay
            year={megaOverlayYear}
            position={megaOverlayPosition}
            highlights={highlights}
            onMouseEnter={handleMegaOverlayMouseEnter}
            onMouseLeave={handleMegaOverlayMouseLeave}
            forceRedraw={forceRedrawCounter}
          />
        )}
      </div>

      {/* Hidden audio element for playing communication first recordings */}
      <audio ref={audioRef} preload="none" style={{ display: "none" }}>
        <track kind="captions" srcLang="en" label="English" default />
      </audio>
    </>
  );
};

export default TimelineYears2;
export { COLORS };

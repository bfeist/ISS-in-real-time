import React, { useState, useMemo } from "react";
import styles from "./testtimeline.module.css";
import TimelineYears2 from "../components/timelineYears/timelineYears2";
import { useGeneralDataAvailabilities } from "../api/useGeneralData";

// Constants for year range
const START_YEAR = 2000;
const END_YEAR = 2025;

// Color constants
const COLOR = {
  hiYellow: "#ffd84d",
  hiCyan: "#58e0ff",
  hiGreen: "#7bff7d",
  hiPink: "#ff7bd1",
  hiOrange: "#ffb156",
};

// Data availability colors from timelineYearsDraw.ts
const DATA_COLORS = {
  noData: "#5b5d77",
  someData: "#6d7090",
  commData: "#7a7ea5",
};

// Main TestTimeline component
const TestTimeline: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTimeSec, _setSelectedTimeSec] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isEditing, _setIsEditing] = useState(false);
  const [isEditingTime, _setIsEditingTime] = useState(false);

  // Fetch data availability from the store
  const { data: dataAvailabilityItems, isLoading: _isLoading } = useGeneralDataAvailabilities();

  // yearsTimelineRef - not needed anymore but keeping for backward compatibility if used elsewhere

  // Tooltip state
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipContent, setTooltipContent] = useState("");
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Highlight toggles
  const [highlights, setHighlights] = useState(new Map<string, string>());
  const [toggleStates, setToggleStates] = useState({
    yellowHighlight: false,
    cyanHighlight: false,
    greenHighlight: false,
    pinkHighlight: false,
    orangeHighlight: false,
  });

  // Create data availability highlights from the actual data
  const dataAvailabilityHighlights = useMemo(() => {
    if (!dataAvailabilityItems) return new Map<string, string>();

    const dataHighlights = new Map<string, string>();

    // Generate highlights for all dates in the range
    for (let year = START_YEAR; year <= END_YEAR; year++) {
      for (let month = 0; month < 12; month++) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

          // Find data for this date
          const dayItem = dataAvailabilityItems.find((item) => item.date === dateStr);

          // Apply the same color logic as timelineYearsDraw.ts
          let dayColor: string;
          if (!dayItem) {
            dayColor = DATA_COLORS.noData;
          } else if (dayItem.comm || dayItem.vvComm) {
            dayColor = DATA_COLORS.commData; // Slightly brighter grey for comm data
          } else {
            dayColor = DATA_COLORS.someData;
          }

          dataHighlights.set(dateStr, dayColor);
        }
      }
    }

    return dataHighlights;
  }, [dataAvailabilityItems]);

  // Combine manual highlights with data availability highlights
  const combinedHighlights = useMemo(() => {
    const combined = new Map(dataAvailabilityHighlights);

    // Override with manual highlights (manual highlights take priority)
    highlights.forEach((color, date) => {
      combined.set(date, color);
    });

    return combined;
  }, [dataAvailabilityHighlights, highlights]);

  const handleDateClick = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    setSelectedDate(date);
  };

  const handleDateHover = (dateStr: string | null, event?: MouseEvent) => {
    if (dateStr && event) {
      setTooltipContent(formatTooltipContent(dateStr));
      setTooltipPosition({ x: event.clientX, y: event.clientY });
      setTooltipVisible(true);
    } else {
      setTooltipVisible(false);
    }
  };

  const formatTooltipContent = (dateStr: string): string => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatLabel = (date: Date | null): string => {
    if (!date) return "";
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTimeCode = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const navigateDate = (direction: "prev" | "next") => {
    if (!selectedDate) return;
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction === "next" ? 1 : -1));

    // Clamp to year range
    if (newDate.getFullYear() >= START_YEAR && newDate.getFullYear() <= END_YEAR) {
      setSelectedDate(newDate);
    }
  };

  const toggleHighlight = (key: keyof typeof toggleStates, color: string) => {
    setToggleStates((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));

    // Simple random highlighting for demo
    if (!toggleStates[key]) {
      const newHighlights = new Map(highlights);
      for (let i = 0; i < 50; i++) {
        // Add 50 random dates
        const year = START_YEAR + Math.floor(Math.random() * (END_YEAR - START_YEAR + 1));
        const month = Math.floor(Math.random() * 12) + 1;
        const day = Math.floor(Math.random() * 28) + 1; // Simplified to avoid invalid dates
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        newHighlights.set(dateStr, color);
      }
      setHighlights(newHighlights);
    } else {
      // Remove highlights of this color
      const newHighlights = new Map();
      highlights.forEach((value, key) => {
        if (value !== color) {
          newHighlights.set(key, value);
        }
      });
      setHighlights(newHighlights);
    }
  };

  return (
    <div className={styles.wrap}>
      {/* Day Backdrop */}
      <div className={styles.dayBackdrop} style={{ display: selectedDate ? "block" : "none" }}>
        <img src="" alt="Selected day background" />
      </div>

      <div className={styles.panel}>
        {/* Panel Header */}
        <header className={styles.panelHeader}>
          <h1>ISS in Real Time — Year highlight & day hover</h1>
          <div className={styles.hint}>Click a day • Hover to preview</div>
        </header>

        {/* Years Timeline */}
        <TimelineYears2
          highlights={combinedHighlights}
          selectedDate={selectedDate}
          isCollapsed={isCollapsed}
          onDateHover={handleDateHover}
          onDateClick={handleDateClick}
        />

        {/* Controls */}
        <div className={`${styles.panelChrome} ${isCollapsed ? styles.hidden : ""}`}>
          <div className={styles.controls}>
            {/* Highlight Toggles */}
            <label className={`${styles.toggle} ${styles.swatchYellow}`}>
              <input
                type="checkbox"
                checked={toggleStates.yellowHighlight}
                onChange={() => toggleHighlight("yellowHighlight", COLOR.hiYellow)}
              />
              Photos taken
            </label>

            <label className={`${styles.toggle} ${styles.swatchCyan}`}>
              <input
                type="checkbox"
                checked={toggleStates.cyanHighlight}
                onChange={() => toggleHighlight("cyanHighlight", COLOR.hiCyan)}
              />
              Communication
            </label>

            <label className={`${styles.toggle} ${styles.swatchGreen}`}>
              <input
                type="checkbox"
                checked={toggleStates.greenHighlight}
                onChange={() => toggleHighlight("greenHighlight", COLOR.hiGreen)}
              />
              EVA (spacewalk)
            </label>

            <label className={`${styles.toggle} ${styles.swatchPink}`}>
              <input
                type="checkbox"
                checked={toggleStates.pinkHighlight}
                onChange={() => toggleHighlight("pinkHighlight", COLOR.hiPink)}
              />
              Crew activity
            </label>

            <label className={`${styles.toggle} ${styles.swatchOrange}`}>
              <input
                type="checkbox"
                checked={toggleStates.orangeHighlight}
                onChange={() => toggleHighlight("orangeHighlight", COLOR.hiOrange)}
              />
              Science experiments
            </label>
          </div>
        </div>

        {/* Panel Tab */}
        <div
          className={`${styles.panelTab} ${selectedDate ? styles.hasDate : ""} ${isEditing ? styles.editing : ""} ${isEditingTime ? styles.editingTime : ""}`}
        >
          <div className={styles.empty}>Select a day to begin</div>

          <div className={styles.stack}>
            {/* Date Navigation */}
            <div className={styles.groupDate}>
              <div className={styles.seg}>
                <button
                  className={styles.nav}
                  onClick={() => navigateDate("prev")}
                  disabled={!selectedDate}
                >
                  ‹
                </button>
              </div>
              <div className={styles.seg}>
                <div className={styles.label}>
                  <span>{formatLabel(selectedDate)}</span>
                  <input type="text" style={{ display: "none" }} />
                </div>
              </div>
              <div className={styles.seg}>
                <button
                  className={styles.nav}
                  onClick={() => navigateDate("next")}
                  disabled={!selectedDate}
                >
                  ›
                </button>
              </div>
            </div>

            {/* Time Display */}
            <div className={styles.groupTime}>
              <span>{formatTimeCode(selectedTimeSec)}</span>
              <input type="text" style={{ display: "none" }} />
            </div>

            {/* Control Buttons */}
            <button
              className={`${styles.btnCtl} ${styles.btnPause} ${isPaused ? styles.pressed : ""}`}
              onClick={() => setIsPaused(!isPaused)}
              disabled={!selectedDate}
            >
              {isPaused ? "▶" : "⏸"}
            </button>

            <button
              className={`${styles.btnCtl} ${styles.btnMute} ${isMuted ? styles.pressed : ""}`}
              onClick={() => setIsMuted(!isMuted)}
              disabled={!selectedDate}
            >
              {isMuted ? "🔊" : "🔇"}
            </button>
          </div>
        </div>

        {/* Panel Toggle */}
        <button
          className={styles.panelToggle}
          onClick={() => setIsCollapsed(!isCollapsed)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsCollapsed(!isCollapsed);
            }
          }}
          aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
        >
          <div className={styles.icon}>{isCollapsed ? "+" : "−"}</div>
          {isCollapsed ? "Open" : "Close"}
        </button>
      </div>

      {/* Tooltip */}
      {tooltipVisible && (
        <div
          className={`${styles.cursorTip} ${styles.on} ${styles.below}`}
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y - 40,
            transform: "translateX(-50%) translateY(200%)",
          }}
        >
          <span className={styles.tipDate}>{tooltipContent}</span>
        </div>
      )}
    </div>
  );
};

export default TestTimeline;

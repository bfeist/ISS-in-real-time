import React, { useEffect, useRef, useState, useCallback } from "react";
import styles from "./testtimeline.module.css";

// Constants from the original HTML
const START_YEAR = 2000;
const END_YEAR = 2025;
const MONTH_GAP = 2;
const ROW_GAP = 2;

// Color constants
const COLOR = {
  gridline: "#1a2230",
  tile: "#77798B",
  tileHover: "#ffffff",
  hiYellow: "#ffd84d",
  hiCyan: "#58e0ff",
  hiGreen: "#7bff7d",
  hiPink: "#ff7bd1",
  hiOrange: "#ffb156",
};

interface YearCanvasProps {
  year: number;
  index: number;
  isActive?: boolean;
  isSelected?: boolean;
  highlights: Map<string, string>;
  onHover?: (dateStr: string | null, event?: MouseEvent) => void;
  onClick?: (dateStr: string) => void;
  onYearHover?: (yearIndex: number) => void;
  onYearLeave?: () => void;
}

// Individual year canvas component
const YearCanvas: React.FC<YearCanvasProps> = ({
  year,
  index,
  isActive,
  isSelected,
  highlights,
  onHover,
  onClick,
  onYearHover,
  onYearLeave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContainerMouseEnter = () => {
    if (onYearHover) onYearHover(index);
  };

  const handleContainerMouseLeave = () => {
    if (onYearLeave) onYearLeave();
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Set canvas size accounting for device pixel ratio
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw calendar grid for the year
    drawYearCalendar(ctx, year, rect.width, rect.height, highlights);
  }, [year, highlights]);

  const drawYearCalendar = (
    ctx: CanvasRenderingContext2D,
    year: number,
    width: number,
    height: number,
    highlights: Map<string, string>
  ) => {
    const months = 12;
    const maxDaysInMonth = 31;
    const cellWidth = (width - (months - 1) * MONTH_GAP) / months;
    const cellHeight = (height - (maxDaysInMonth - 1) * ROW_GAP) / maxDaysInMonth; // No header offset for main calendar

    for (let month = 0; month < months; month++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const startX = month * (cellWidth + MONTH_GAP);

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const x = startX;
        const y = (day - 1) * (cellHeight + ROW_GAP); // Start from top of canvas

        // Determine cell color
        let color = COLOR.tile;
        if (highlights.has(dateStr)) {
          color = highlights.get(dateStr) || COLOR.tile;
        }

        ctx.fillStyle = color;
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !onHover) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Calculate which date was hovered (simplified)
    const dateStr = getDateFromCoordinates(x, y, year, rect.width, rect.height);
    onHover(dateStr, event.nativeEvent);
  };

  const handleMouseLeave = () => {
    if (onHover) onHover(null);
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !onClick) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dateStr = getDateFromCoordinates(x, y, year, rect.width, rect.height);
    if (dateStr) onClick(dateStr);
  };

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const handleResize = () => {
      setTimeout(draw, 0);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className={`${styles.year} ${isActive ? styles.active : ""} ${isSelected ? styles.selected : ""}`}
      onMouseEnter={handleContainerMouseEnter}
      onMouseLeave={handleContainerMouseLeave}
    >
      <div className={styles.yearHeader}>
        <div className={styles.yearTitle}>{year}</div>
      </div>
      <div className={styles.monthsCanvas}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{ width: "100%", height: "180px" }}
        />
      </div>
    </div>
  );
};

// Helper function to determine date from canvas coordinates
const getDateFromCoordinates = (
  x: number,
  y: number,
  year: number,
  width: number,
  height: number
): string | null => {
  const months = 12;
  const maxDaysInMonth = 31;
  const cellWidth = (width - (months - 1) * MONTH_GAP) / months;
  const cellHeight = (height - (maxDaysInMonth - 1) * ROW_GAP) / maxDaysInMonth;

  // Determine month
  const month = Math.floor(x / (cellWidth + MONTH_GAP));
  if (month < 0 || month >= months) return null;

  // Determine day (no header offset for main calendar)
  const day = Math.floor(y / (cellHeight + ROW_GAP)) + 1;

  // Validate day exists in this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;

  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

// Mega Overlay Component for zoomed year view
const MegaYearOverlay: React.FC<{
  year: number;
  position: { left: number; top: number; width: number };
  highlights: Map<string, string>;
  onHover?: (dateStr: string | null, event?: MouseEvent) => void;
  onClick?: (dateStr: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}> = ({ year, position, highlights, onHover, onClick, onMouseEnter, onMouseLeave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Constants for mega overlay layout - make squares square
  const cellGap = 2;
  const maxDaysInMonth = 31;
  const months = 12;
  const cellWidth = (position.width - (months - 1) * cellGap) / months;
  const cellSize = cellWidth;
  const totalHeight = maxDaysInMonth * (cellSize + cellGap);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width } = position;
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Set canvas size
    canvas.width = width * devicePixelRatio;
    canvas.height = totalHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Clear canvas with transparent background
    ctx.clearRect(0, 0, width, totalHeight);

    // Draw only the calendar grid - no labels, no headers
    for (let day = 1; day <= maxDaysInMonth; day++) {
      const y = (day - 1) * (cellSize + cellGap);

      for (let month = 0; month < months; month++) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        if (day <= daysInMonth) {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const x = month * (cellWidth + cellGap);

          // Determine cell color
          let color = COLOR.tile;
          if (highlights.has(dateStr)) {
            color = highlights.get(dateStr) || COLOR.tile;
          }

          ctx.fillStyle = color;
          ctx.fillRect(x, y, cellWidth, cellSize);
        }
      }
    }
  }, [year, position, highlights, cellWidth, cellSize, totalHeight]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onHover) return;

    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dateStr = getMegaDateFromCoordinates(x, y, year, position.width);
    onHover(dateStr, event.nativeEvent);
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onClick) return;

    const overlay = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dateStr = getMegaDateFromCoordinates(x, y, year, position.width);
    if (dateStr) onClick(dateStr);
  };

  const handleMouseLeave = () => {
    if (onHover) onHover(null);
    if (onMouseLeave) onMouseLeave();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div
      className={styles.yearOverlay}
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        height: totalHeight,
        display: "block",
        pointerEvents: "auto",
        zIndex: 10,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={onMouseEnter}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="grid"
      tabIndex={0}
      aria-label={`Calendar for ${year}`}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: `${totalHeight}px`, pointerEvents: "none" }}
      />
    </div>
  );
};

// Helper function for mega overlay hit detection
const getMegaDateFromCoordinates = (
  x: number,
  y: number,
  year: number,
  width: number
): string | null => {
  const cellGap = 2;
  const months = 12;

  const cellWidth = (width - (months - 1) * cellGap) / months;
  const cellSize = cellWidth;

  // Determine month
  const month = Math.floor(x / (cellWidth + cellGap));
  if (month < 0 || month >= months) return null;

  // Determine day
  const day = Math.floor(y / (cellSize + cellGap)) + 1;

  // Validate day exists in this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;

  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
  const [hoveredYearIndex, setHoveredYearIndex] = useState<number | null>(null);
  const [selectedYearEl, setSelectedYearEl] = useState<number | null>(null);
  const [megaOverlayVisible, setMegaOverlayVisible] = useState(false);
  const [megaOverlayYear, setMegaOverlayYear] = useState<number | null>(null);
  const [megaOverlayPosition, setMegaOverlayPosition] = useState({ left: 0, top: 0, width: 0 });
  const [isOverMegaOverlay, setIsOverMegaOverlay] = useState(false);

  // yearsTimelineRef
  const yearsTimelineRef = useRef<HTMLDivElement>(null);

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
    const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);
    const year = years[yearIndex];

    if (!yearsTimelineRef.current) return;

    const yearElements = yearsTimelineRef.current.querySelectorAll(`.${styles.year}`);
    const yearEl = yearElements[yearIndex] as HTMLElement;
    if (!yearEl) return;

    const yearsTimelineRect = yearsTimelineRef.current.getBoundingClientRect();
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

  const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

  const handleDateClick = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    setSelectedDate(date);
    setSelectedYearEl(date.getFullYear());
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
      setSelectedYearEl(newDate.getFullYear());
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

      <div className={`${styles.panel} ${isCollapsed ? styles.isCollapsed : ""}`}>
        {/* Panel Header */}
        <header className={styles.panelHeader}>
          <h1>ISS in Real Time — Year highlight & day hover</h1>
          <div className={styles.hint}>Click a day • Hover to preview</div>
        </header>

        {/* Years Timeline */}
        <div className={styles.yearsTimeline} ref={yearsTimelineRef}>
          <div className={styles.years}>
            {years.map((year, index) => (
              <YearCanvas
                key={year}
                year={year}
                index={index}
                isActive={hoveredYearIndex === index}
                isSelected={selectedYearEl === year}
                highlights={highlights}
                onHover={handleDateHover}
                onClick={handleDateClick}
                onYearHover={handleYearHover}
                onYearLeave={handleYearLeave}
              />
            ))}
          </div>

          {/* Mega Overlay */}
          {megaOverlayVisible && megaOverlayYear && (
            <MegaYearOverlay
              year={megaOverlayYear}
              position={megaOverlayPosition}
              highlights={highlights}
              onHover={handleDateHover}
              onClick={handleDateClick}
              onMouseEnter={handleMegaOverlayMouseEnter}
              onMouseLeave={handleMegaOverlayMouseLeave}
            />
          )}
        </div>

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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

// Import existing hooks and utilities
import { useGeneralDataAvailabilities, useGeneralCrewArrDep } from "../../api/useGeneralData";
import { useStateSelectedDate } from "../../store/hooks/useStateSelectedDate";
import { useStateHover } from "../../store/hooks/useStateHover";
import { useStateCrewSelection } from "../../store/hooks/useStateCrewSelection";
import { useStateContentHighlights } from "../../store/hooks/useStateContentHighlights";
import { useStateToggle } from "../../store/hooks/useStateToggle";
import {
  calculateOptimalMaxWidth,
  calculateMinimumWidth,
  YEAR_GAP_PX,
} from "../../utils/indexSliderCalcs";
import DateTooltip from "./subcomponents/dateTooltip/dateTooltip";

// Import styles
import styles from "./timelineYearsOptimized.module.css";

// Configure dayjs
dayjs.extend(utc);

interface DayData {
  date: Date;
  dateString: string;
  dayOfMonth: number;
  dataAvailability: DataAvailability | null;
  isCrewOnboard: boolean;
  satisfiesHighlights: boolean;
  x: number; // Position within the timeline
  y: number; // Row position (day of month - 1)
  year: number; // Year this day belongs to (for fast magnification lookup)
}

const TimelineYearsOptimized: React.FC = () => {
  const dataAvailabilityQuery = useGeneralDataAvailabilities();
  const {
    data: dataAvailabilityItems,
    isLoading: isLoadingDataAvailability,
    error,
  } = dataAvailabilityQuery;
  const { data: crewArrDep, isLoading: isLoadingCrewArrDep } = useGeneralCrewArrDep();
  const { dateTimeSlug } = useParams();

  // Check if any of the required data is still loading
  const isLoading = isLoadingDataAvailability || isLoadingCrewArrDep;

  const { selectedDate, setSelectedDate } = useStateSelectedDate();
  const { hoveredDate, setHoveredDate } = useStateHover();
  const { selectedCrewMember } = useStateCrewSelection();
  const { contentHighlights } = useStateContentHighlights();
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [timelineWidth, setTimelineWidth] = useState(() => {
    const windowWidth = window.innerWidth;
    const optimalMaxWidth = calculateOptimalMaxWidth();
    const minimumWidth = calculateMinimumWidth();

    if (windowWidth < minimumWidth) {
      return minimumWidth;
    } else if (windowWidth > optimalMaxWidth) {
      return optimalMaxWidth;
    } else {
      return windowWidth;
    }
  });

  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [isTouchInteraction, setIsTouchInteraction] = useState(false);
  const [pendingTouchDate, setPendingTouchDate] = useState<string | null>(null);

  // Magnification state
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const [magnificationProgress, setMagnificationProgress] = useState(0); // 0-1 for smooth transitions
  const animationFrameRef = useRef<number | null>(null);

  // Helper function to check if date is in crew period
  const isDateInCrewPeriod = useCallback(
    (checkDate: Date): boolean => {
      if (!crewArrDep || !selectedCrewMember) return false;

      const selectedCrewStays = crewArrDep.filter(
        (item: CrewArrDepItem) => `${item.name_first} ${item.name_last}` === selectedCrewMember.name
      );

      return selectedCrewStays.some((stay) => {
        const arrivalDate = new Date(stay.arrivalDate);
        const departureDate = new Date(stay.departureDate);
        arrivalDate.setHours(0, 0, 0, 0);
        departureDate.setHours(23, 59, 59, 999);
        checkDate.setHours(12, 0, 0, 0);
        return checkDate >= arrivalDate && checkDate <= departureDate;
      });
    },
    [crewArrDep, selectedCrewMember]
  );

  // Helper function to check content highlights
  const doesDaySatisfyContentHighlights = useCallback(
    (dayItem: DataAvailability | null): boolean => {
      if (!contentHighlights || contentHighlights.length === 0) return false;
      if (!dayItem) return false;

      return contentHighlights.every((highlight: string) => {
        switch (highlight.toLowerCase()) {
          case "comm":
            return dayItem.comm || dayItem.vvComm;
          case "youtube":
            return dayItem.youtube;
          case "eva":
            return dayItem.eva;
          case "blog":
            return dayItem.blog || dayItem.activitySummary;
          case "earthphotography":
            return dayItem.earthPhotography;
          default:
            return false;
        }
      });
    },
    [contentHighlights]
  );

  // Build optimized timeline data structure - only days that exist
  const timelineData = useMemo(() => {
    if (!dataAvailabilityItems) return null;

    const epochYear = 2000;
    const epochMonth = 10; // November (0-indexed)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const totalMonthsSinceEpoch = (currentYear - epochYear) * 12 + (currentMonth - epochMonth) + 1;

    let totalDaysSinceEpoch = 0;
    let totalYearGaps = 0;
    const allMonths = [];
    const allDays: DayData[] = [];
    const yearInfo = new Map<number, { monthCount: number; startMonth: number }>();

    // First pass: calculate all months and collect year information
    for (let i = 0; i < totalMonthsSinceEpoch; i++) {
      const monthDate = new Date(epochYear, epochMonth + i, 1);
      const nextMonth = new Date(monthDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(0);
      const daysInMonth = nextMonth.getDate();

      const year = monthDate.getFullYear();
      const isJanuary = monthDate.getMonth() === 0;
      const isFirstMonth = i === 0;

      // Track year information for magnification
      if (!yearInfo.has(year)) {
        yearInfo.set(year, { monthCount: 0, startMonth: i });
      }
      yearInfo.get(year)!.monthCount++;

      if (isJanuary && !isFirstMonth) {
        totalYearGaps++;
      }

      allMonths.push({
        date: monthDate,
        daysInMonth,
        startDay: totalDaysSinceEpoch,
        yearGapsBefore: totalYearGaps,
        hasYearGapBefore: isJanuary && !isFirstMonth,
        year,
        monthIndex: i,
      });

      totalDaysSinceEpoch += daysInMonth;
    }

    // Calculate available width for timeline content (reduced by total gap space)
    const availableWidth = timelineWidth - totalYearGaps * YEAR_GAP_PX;

    // Second pass: generate day data with base positioning (no magnification here)
    allMonths.forEach((month) => {
      // Calculate base position (without magnification)
      const basePosition = (month.startDay / totalDaysSinceEpoch) * availableWidth;
      const gapOffset = month.yearGapsBefore * YEAR_GAP_PX;
      const monthStartX = basePosition + gapOffset + 2; // Add 2px offset like original

      for (let day = 1; day <= month.daysInMonth; day++) {
        const date = new Date(month.date);
        date.setDate(day);
        const dateString = date.toISOString().split("T")[0];

        const dataAvailability =
          dataAvailabilityItems.find((item) => item.date === dateString) || null;
        const isCrewOnboard = isDateInCrewPeriod(new Date(date));
        const satisfiesHighlights = doesDaySatisfyContentHighlights(dataAvailability);

        const x = monthStartX; // Base X position
        const y = day - 1; // Row position (0-30)
        const year = new Date(month.date).getFullYear();

        allDays.push({
          date,
          dateString,
          dayOfMonth: day,
          dataAvailability,
          isCrewOnboard,
          satisfiesHighlights,
          x,
          y,
          year,
        });
      }
    });
    return { allDays, totalDaysSinceEpoch, totalYearGaps, yearInfo };
  }, [
    dataAvailabilityItems,
    timelineWidth,
    isDateInCrewPeriod,
    doesDaySatisfyContentHighlights,
    // Remove magnificationProgress and hoveredYear from here!
    // These should only affect rendering, not data calculation
  ]);

  // Canvas-based rendering for performance
  const drawTimeline = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !timelineData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size - adjust width for magnification
    const height = 165; // 31 days * ~5px + spacing
    let adjustedWidth = timelineWidth;

    // Add extra width for magnification if needed
    if (hoveredYear && timelineData.yearInfo.has(hoveredYear) && magnificationProgress > 0) {
      const yearData = timelineData.yearInfo.get(hoveredYear)!;
      const extraWidth = yearData.monthCount * 3 * magnificationProgress; // Extra width from magnification
      adjustedWidth = timelineWidth + extraWidth;
    }

    canvas.width = adjustedWidth;
    canvas.height = height;
    canvas.style.width = `${adjustedWidth}px`;
    canvas.style.height = `${height}px`;

    // Clear canvas
    ctx.clearRect(0, 0, adjustedWidth, height);

    // Draw days
    const baseBoxSize = 4;
    const magnifiedBoxSize = 8;
    const rowHeight = height / 31; // 31 rows for max days in month

    timelineData.allDays.forEach((day) => {
      // Calculate magnification effects for this day
      const isInMagnifiedYear = hoveredYear === day.year;
      const isAfterMagnifiedYear = hoveredYear !== null && day.year > hoveredYear;

      // Calculate magnification offset
      let magnificationOffset = 0;
      if (hoveredYear && magnificationProgress > 0) {
        if (isAfterMagnifiedYear) {
          // Days after magnified year get pushed right
          const yearData = timelineData.yearInfo.get(hoveredYear);
          if (yearData) {
            magnificationOffset = yearData.monthCount * 3 * magnificationProgress;
          }
        } else if (isInMagnifiedYear) {
          // Days in magnified year get internal spacing
          const yearData = timelineData.yearInfo.get(hoveredYear);
          if (yearData) {
            const dayIndexInYear = timelineData.allDays.filter(
              (d) => d.year === hoveredYear && d.x <= day.x
            ).length;
            magnificationOffset = dayIndexInYear * 0.2 * magnificationProgress;
          }
        }
      }

      const x = day.x + magnificationOffset;
      const y = day.y * rowHeight + (rowHeight - baseBoxSize) / 2;

      // Determine box size based on magnification
      const boxSize = isInMagnifiedYear
        ? baseBoxSize + (magnifiedBoxSize - baseBoxSize) * magnificationProgress
        : baseBoxSize;

      // Determine color
      let fillColor = "#5b5d77ff"; // noData
      if (day.isCrewOnboard) {
        fillColor = "#E2DB00"; // crewOnboard
      } else if (day.satisfiesHighlights) {
        fillColor = "#D9D9D9"; // satisfiesHighlights
      } else if (day.dataAvailability) {
        if (day.dataAvailability.comm || day.dataAvailability.vvComm) {
          fillColor = "#7a7ea5ff"; // commData
        } else {
          fillColor = "#6d7090"; // someData
        }
      }

      // Draw day box
      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, boxSize, boxSize);

      // Draw border for selected/hovered
      if (day.dateString === selectedDate || day.dateString === hoveredDate) {
        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, boxSize, boxSize);
      }

      // Draw highlight border
      if (day.satisfiesHighlights) {
        ctx.strokeStyle = "#C500AB";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, boxSize, boxSize);
      }
    });
  }, [timelineData, timelineWidth, selectedDate, hoveredDate, hoveredYear, magnificationProgress]);

  // Smooth animation for magnification transitions
  const animateToProgress = useCallback(
    (targetProgress: number) => {
      const startProgress = magnificationProgress;
      const startTime = performance.now();
      const duration = 200; // 200ms animation

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out animation
        const easeOutProgress = 1 - Math.pow(1 - progress, 3);

        const currentMagnificationProgress =
          startProgress + (targetProgress - startProgress) * easeOutProgress;
        setMagnificationProgress(currentMagnificationProgress);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          animationFrameRef.current = null;
        }
      };

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [magnificationProgress]
  );

  // Handle year hover changes
  const handleYearHover = useCallback(
    (year: number | null) => {
      if (year !== hoveredYear) {
        setHoveredYear(year);
        animateToProgress(year ? 1 : 0);
      }
    },
    [hoveredYear, animateToProgress]
  );

  // Helper to get year from canvas position
  const getYearFromPosition = useCallback(
    (x: number): number | null => {
      if (!timelineData) return null;

      // Find which year this x position falls into
      const years = Array.from(timelineData.yearInfo.keys()).sort((a, b) => a - b);

      for (const year of years) {
        const yearDays = timelineData.allDays.filter(
          (day) => new Date(day.dateString).getFullYear() === year
        );

        if (yearDays.length > 0) {
          const minX = Math.min(...yearDays.map((day) => day.x));
          const maxX = Math.max(...yearDays.map((day) => day.x)) + 8; // Add some padding

          if (x >= minX && x <= maxX) {
            return year;
          }
        }
      }

      return null;
    },
    [timelineData]
  );

  // Handle canvas click/hover
  const handleCanvasInteraction = useCallback(
    (event: React.MouseEvent, isClick: boolean = false) => {
      if (!timelineData || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Check for year hover first (for magnification)
      if (!isClick && !isTouchInteraction) {
        const year = getYearFromPosition(x);
        handleYearHover(year);
      }

      // Find closest day (existing logic)
      let closestDay: DayData | null = null;
      let minDistance = Infinity;

      const baseBoxSize = 4;
      const magnifiedBoxSize = 8;
      const rowHeight = 165 / 31;

      timelineData.allDays.forEach((day) => {
        // Calculate magnification effects for hit detection
        const isInMagnifiedYear = hoveredYear === day.year;
        const isAfterMagnifiedYear = hoveredYear !== null && day.year > hoveredYear;

        // Calculate magnification offset (same logic as drawing)
        let magnificationOffset = 0;
        if (hoveredYear && magnificationProgress > 0) {
          if (isAfterMagnifiedYear) {
            const yearData = timelineData.yearInfo.get(hoveredYear);
            if (yearData) {
              magnificationOffset = yearData.monthCount * 3 * magnificationProgress;
            }
          } else if (isInMagnifiedYear) {
            const yearData = timelineData.yearInfo.get(hoveredYear);
            if (yearData) {
              const dayIndexInYear = timelineData.allDays.filter(
                (d) => d.year === hoveredYear && d.x <= day.x
              ).length;
              magnificationOffset = dayIndexInYear * 0.2 * magnificationProgress;
            }
          }
        }

        // Use current box size for hit detection
        const boxSize = isInMagnifiedYear
          ? baseBoxSize + (magnifiedBoxSize - baseBoxSize) * magnificationProgress
          : baseBoxSize;

        const dayX = day.x + magnificationOffset + boxSize / 2;
        const dayY = day.y * rowHeight + rowHeight / 2;
        const distance = Math.sqrt((x - dayX) ** 2 + (y - dayY) ** 2);

        // Adjust hit detection radius based on box size
        const hitRadius = Math.max(10, boxSize * 1.5);
        if (distance < minDistance && distance < hitRadius) {
          minDistance = distance;
          closestDay = day;
        }
      });

      if (isClick) {
        if (closestDay) {
          const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
          if (isTouchDevice) {
            setPendingTouchDate(closestDay.dateString);
            setHoveredDate(closestDay.dateString);
          } else {
            setSelectedDate(closestDay.dateString);
            setShowTimelineYears(false);
          }
        }
      } else {
        // Hover
        if (isTouchInteraction && closestDay) {
          setPendingTouchDate(closestDay.dateString);
        } else if (!isTouchInteraction) {
          setHoveredDate(closestDay?.dateString || null);
          setPendingTouchDate(null);
        }

        setCursorPosition({ x: event.clientX, y: event.clientY });
      }
    },
    [
      timelineData,
      isTouchInteraction,
      setHoveredDate,
      setSelectedDate,
      setShowTimelineYears,
      getYearFromPosition,
      handleYearHover,
      magnificationProgress,
      hoveredYear,
    ]
  );

  const handleCanvasLeave = useCallback(() => {
    if (!isTouchInteraction) {
      setHoveredDate(null);
      setCursorPosition(null);
      // Also clear year hover when leaving canvas
      handleYearHover(null);
    }
  }, [isTouchInteraction, setHoveredDate, handleYearHover]);

  // Touch event handlers
  const handleTouchGo = useCallback(() => {
    if (pendingTouchDate) {
      setSelectedDate(pendingTouchDate);
      setShowTimelineYears(false);
      setPendingTouchDate(null);
      setIsTouchInteraction(false);
      setHoveredDate(null);
      setCursorPosition(null);
    }
  }, [pendingTouchDate, setSelectedDate, setHoveredDate, setShowTimelineYears]);

  const handleTouchCancel = useCallback(() => {
    setPendingTouchDate(null);
    setIsTouchInteraction(false);
    setHoveredDate(null);
    setCursorPosition(null);
  }, [setHoveredDate]);

  // Initialize showTimeline state
  useEffect(() => {
    if (dateTimeSlug) {
      setShowTimelineYears(false);
    } else {
      setShowTimelineYears(selectedDate === null || selectedDate === undefined);
    }
  }, [dateTimeSlug, selectedDate, setShowTimelineYears]);

  // Update timeline width on window resize
  useEffect(() => {
    const updateTimelineWidth = () => {
      const windowWidth = window.innerWidth;
      const optimalMaxWidth = calculateOptimalMaxWidth();
      const minimumWidth = calculateMinimumWidth();

      if (windowWidth < minimumWidth) {
        setTimelineWidth(minimumWidth);
      } else if (windowWidth > optimalMaxWidth) {
        setTimelineWidth(optimalMaxWidth);
      } else {
        setTimelineWidth(windowWidth);
      }
    };

    window.addEventListener("resize", updateTimelineWidth);
    return () => window.removeEventListener("resize", updateTimelineWidth);
  }, []);

  // Draw timeline when data changes
  useEffect(() => {
    drawTimeline();
  }, [drawTimeline]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Handle loading state
  if (isLoading) {
    return (
      <div className={styles.timelineContainer}>
        <div className={styles.loadingMessage}>Loading timeline...</div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className={styles.timelineContainer}>
        <div className={styles.errorMessage}>Error loading timeline data</div>
      </div>
    );
  }

  // Handle no data
  if (!dataAvailabilityItems || dataAvailabilityItems.length === 0 || !timelineData) {
    return (
      <div className={styles.timelineContainer}>
        <div className={styles.noDataMessage}>No timeline data available</div>
      </div>
    );
  }

  return (
    <>
      {/* Floating date tooltip */}
      <DateTooltip
        hoveredDate={hoveredDate}
        cursorPosition={cursorPosition}
        isTouchInteraction={isTouchInteraction}
        showTimelineYears={showTimelineYears}
        onTouchGo={handleTouchGo}
        onTouchCancel={handleTouchCancel}
        containerRef={containerRef}
      />

      <div ref={containerRef} className={styles.timelineContainer}>
        <div className={styles.yearsRow}>
          <div className={styles.timelineScrollContainer}>
            <canvas
              ref={canvasRef}
              className={styles.timelineCanvas}
              onMouseMove={(e) => handleCanvasInteraction(e, false)}
              onMouseLeave={handleCanvasLeave}
              onClick={(e) => handleCanvasInteraction(e, true)}
              onTouchStart={() => setIsTouchInteraction(true)}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default TimelineYearsOptimized;

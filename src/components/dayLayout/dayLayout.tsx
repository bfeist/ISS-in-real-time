import { FunctionComponent, useEffect, useState, useMemo, useRef } from "react";
import styles from "./dayLayout.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateDayNight } from "store/hooks/useStateDayNight";
import { useStateSearch } from "store/hooks/useStateSearch";
import { useDateDataAvailability, useDateEphemera } from "api/useDateSpecificData";
import { useDateCommTranscript } from "api/useDateSpecificData";
import { useGeneralVideoIa, useGeneralVideoYt } from "api/useGeneralData";
import { useDateCacheManagement } from "api/useDateCacheManagement";
import { useParams } from "react-router-dom";
import { appSecondsFromTimeStr } from "utils/dateTime";
import { parseDateTimeSlug } from "utils/params";
import { calcDayNight } from "utils/day-night";
import { findClosestEphemeraItem } from "utils/map";
import { resolveLayout } from "./layouts";
import TimelineDayContainer from "components/timelineDay/timelineDayContainer";
import Comm from "components/panes/comm";
import Articles from "components/panes/articles";
import EvaInfo from "components/panes/evaInfo";
import Video from "components/panes/video";
import Photos from "components/panes/photos";
import ExpeditionAndCrewOnboard from "components/panes/expCrewFlightWidget/expeditionsAndCrew";
import Flights from "components/panes/expCrewFlightWidget/flights";
import Widget from "components/panes/expCrewFlightWidget/widget";
import MobileLayout, { TabName } from "./mobileLayout";
import { GlobeOrMap } from "./globeOrMap";

const SILENT_AUDIO_DATA_URI =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

// Custom hook to detect viewport width
const useViewport = () => {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return { width };
};

// Helper function to render a component based on type
const renderComponent = (config: ComponentConfig): JSX.Element | null => {
  const { type, styleClass = "componentExpandable" } = config;

  // Determine the CSS class to use
  const componentClass =
    styleClass === "componentNaturalSize"
      ? styles.componentNaturalSize
      : styles.componentExpandable;

  switch (type) {
    case "video":
      return (
        <div className={componentClass}>
          <Video />
        </div>
      );
    case "eva":
      return (
        <div className={componentClass}>
          <EvaInfo long={false} />
        </div>
      );
    case "eva-long":
      return (
        <div className={componentClass}>
          <EvaInfo long={true} />
        </div>
      );
    case "article":
      return (
        <div className={componentClass}>
          <Articles />
        </div>
      );
    case "photo":
      return (
        <div className={componentClass}>
          <Photos />
        </div>
      );
    case "photo-tall":
      return (
        <div className={componentClass}>
          <Photos height={"tall"} />
        </div>
      );
    case "comm":
      return (
        <div className={componentClass}>
          <Comm />
        </div>
      );
    case "globe":
      return (
        <div className={componentClass}>
          <GlobeOrMap />
        </div>
      );
    case "widget":
    case "widget-tall":
      return (
        <div className={componentClass}>
          <Widget />
        </div>
      );
    case "widget-rest":
      return (
        <div className={componentClass}>
          <ExpeditionAndCrewOnboard />
        </div>
      );
    case "flights":
      return (
        <div className={componentClass}>
          <Flights />
        </div>
      );

    default:
      console.warn(`Unknown component type: ${type}`);
      return <div className={styles.placeholder}>Unknown: {type}</div>;
  }
};

// Helper function to render multiple components in a column
const renderColumn = (components: ComponentConfig[], columnClass: string): JSX.Element => {
  if (components.length === 0) {
    return <div className={`${columnClass} ${styles.placeholder}`}>Empty Column</div>;
  }

  if (components.length === 1) {
    return <div className={columnClass}>{renderComponent(components[0])}</div>;
  }

  // Multiple components - stack them vertically
  return (
    <div className={`${columnClass} ${styles.column}`}>
      {components.map((component, index) => {
        // Determine section class based on component styleClass
        const sectionClass =
          component.styleClass === "componentNaturalSize"
            ? `${styles.columnSection} ${styles.columnSectionNatural}`
            : `${styles.columnSection} ${styles.columnSectionExpandable}`;

        return (
          <div key={`${component.type}-${index}`} className={sectionClass}>
            {renderComponent(component)}
          </div>
        );
      })}
    </div>
  );
};

const DayLayout: FunctionComponent = () => {
  const { selectedDate, startClock, setTimeOnly, appSecondsAtStartStop } = useStateClock();
  const { setDayNight } = useStateDayNight();
  const { selectedNotableMoment } = useStateSearch();
  const { dateTimeSlug } = useParams();
  const { data: dataAvailability } = useDateDataAvailability(selectedDate);
  const { data: commItems = [] } = useDateCommTranscript(selectedDate);
  const { data: videoYt = [] } = useGeneralVideoYt();
  const { data: videoIa = [] } = useGeneralVideoIa();
  const { data: ephemeraItems = [] } = useDateEphemera(selectedDate || "");
  const { width } = useViewport();
  const isMobile = width < 768;
  const [audioAutoplayAllowed, setAudioAutoplayAllowed] = useState<boolean | null>(null);
  const initializedDateRef = useRef<string | null>(null);

  const parsedDateTimeSlug = useMemo(
    () => (dateTimeSlug ? parseDateTimeSlug(dateTimeSlug) : null),
    [dateTimeSlug]
  );
  const slugIncludesTime = Boolean(parsedDateTimeSlug?.time);

  // Calculate dayNight and store in global state
  const dayNight = useMemo(() => {
    if (!ephemeraItems || ephemeraItems.length === 0 || !selectedDate) return [];
    const ephemeris = findClosestEphemeraItem(new Date(`${selectedDate}T12:00:00Z`), ephemeraItems);
    const tle = `${ephemeris.tle_line1}
                 ${ephemeris.tle_line2}`;
    const result = calcDayNight(tle, selectedDate);
    return result;
  }, [ephemeraItems, selectedDate]);

  // Update global state when dayNight changes
  useEffect(() => {
    if (dayNight.length > 0) {
      setDayNight(dayNight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayNight]);

  // Find YouTube recording for this date
  const videoYtRecording = videoYt?.find((recording: VideoYtItem) =>
    recording.ytStartTime.startsWith(selectedDate || "")
  );
  const videoIaRecording = videoIa?.find(
    (recording: VideoIaItem) => recording.date === selectedDate
  );

  // Manage cache when date changes
  useDateCacheManagement(selectedDate);

  // Detect whether the browser permits autoplay of unmuted audio
  useEffect(() => {
    if (!slugIncludesTime) {
      return;
    }

    if (typeof window === "undefined") {
      setAudioAutoplayAllowed(true);
      return;
    }

    let isActive = true;
    const audioElement = document.createElement("audio");
    audioElement.src = SILENT_AUDIO_DATA_URI;
    audioElement.preload = "auto";
    audioElement.volume = 0.1;

    const checkAutoplay = async () => {
      try {
        await audioElement.play();
        if (!isActive) return;
        setAudioAutoplayAllowed(true);
      } catch (error) {
        if (!isActive) return;
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setAudioAutoplayAllowed(false);
        } else {
          setAudioAutoplayAllowed(true);
        }
      } finally {
        audioElement.pause();
        audioElement.src = "";
      }
    };

    checkAutoplay();

    return () => {
      isActive = false;
      audioElement.pause();
      audioElement.src = "";
    };
  }, [slugIncludesTime]);

  // Start the clock only if autoplay is allowed when arriving via time-specific slug, or if there's no comm data
  useEffect(() => {
    if (!selectedDate || !slugIncludesTime) {
      return;
    }

    if (audioAutoplayAllowed === null) {
      return;
    }

    if (audioAutoplayAllowed || commItems.length === 0) {
      startClock();
    }
  }, [audioAutoplayAllowed, selectedDate, slugIncludesTime, startClock, commItems.length]);

  // Set initial clock position and start the clock when a day loads
  useEffect(() => {
    if (!selectedDate) return;

    // Handle dateTimeSlug parameter - takes highest priority
    if (slugIncludesTime) {
      // If the slug included a time we defer to the autoplay handling above
      return;
    }

    // Only initialize the clock position once per date to avoid infinite loops
    // Allow re-initialization if the notable moment changes
    const initKey = selectedNotableMoment
      ? `${selectedDate}-${selectedNotableMoment.datetime}`
      : selectedDate;

    if (initializedDateRef.current === initKey) {
      return;
    }
    initializedDateRef.current = initKey;

    // If the date is a selected notable moment, set clock to that time
    if (selectedNotableMoment && selectedNotableMoment.datetime.startsWith(selectedDate || "")) {
      const timeStr = selectedNotableMoment.datetime.split("T")[1];
      setTimeOnly(appSecondsFromTimeStr(timeStr));
      startClock();
      return;
    }

    // Set automatic clock position based on available data
    // YouTube takes priority over comm data
    if (videoYtRecording || videoIaRecording) {
      // Set the clock to the start time of the YouTube recording
      const startTimeStr = videoYtRecording?.ytStartTime.split("T")[1] || videoIaRecording?.time;
      setTimeOnly(appSecondsFromTimeStr(startTimeStr));
    } else if (commItems.length > 0) {
      // If we have comm data and no YouTube, start 10 seconds before first comm
      const firstComm = commItems[0];
      setTimeOnly(appSecondsFromTimeStr(firstComm.utteranceTime) - 10);
    } else {
      // Default to current time if today, otherwise 12:00:00 (noon)
      const today = new Date().toISOString().split("T")[0];
      if (selectedDate === today) {
        const now = new Date();
        const currentSeconds =
          now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
        setTimeOnly(currentSeconds);
      } else {
        // Default to noon if not today
        setTimeOnly(43200);
      }
    }

    // Start the clock after setting position
    startClock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, dateTimeSlug, videoYtRecording, videoIaRecording, selectedNotableMoment]);

  // Handle left/right arrow keys to adjust clock by 10 seconds
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle arrow keys if not focused on an interactive element
      const target = e.target as HTMLElement;
      const isInteractive =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable ||
        target.closest('[role="button"]') ||
        target.closest('[role="slider"]') ||
        target.closest("button") ||
        target.closest("a");

      // Don't interfere with accessibility navigation
      if (isInteractive) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setTimeOnly(Math.max(0, appSecondsAtStartStop - 10));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setTimeOnly(Math.min(86399, appSecondsAtStartStop + 10)); // Max 23:59:59
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [appSecondsAtStartStop, setTimeOnly]);

  // Resolve the layout based on data availability
  const layout = resolveLayout(dataAvailability);

  const columns = layout.layout;
  const allComponents = [...columns.left, ...columns.center, ...columns.right];
  const componentTypes = new Set<ComponentConfig["type"]>(
    allComponents.map((component) => component.type)
  );
  const hasType = (...types: ComponentConfig["type"][]) =>
    types.some((type) => componentTypes.has(type));

  const mobileTabs = (
    [
      { name: "video", visible: hasType("video") },
      { name: "photos", visible: hasType("photo", "photo-tall") },
      { name: "orbit", visible: hasType("globe") },
      { name: "comm", visible: hasType("comm") },
      { name: "articles", visible: hasType("article") },
      {
        name: "onboard",
        visible: hasType("widget", "widget-tall", "widget-rest"),
      },
      { name: "eva", visible: hasType("eva", "eva-long") },
    ] as const
  )
    .filter((tab) => tab.visible)
    .map((tab) => tab.name as TabName);

  let content = null;
  if (isMobile) {
    // Use mobile tabbed layout
    content = <MobileLayout tabs={mobileTabs} />;
  } else {
    content = (
      <div className={styles.dayLayout}>
        {/* Timeline at the top */}
        <div className={styles.timeline}>
          <TimelineDayContainer />
        </div>

        {/* Three column body layout */}
        <div className={styles.body}>
          {renderColumn(layout.layout.left, styles.leftColumn)}

          {renderColumn(layout.layout.center, styles.centerColumn)}

          {renderColumn(layout.layout.right, styles.rightColumn)}
        </div>
      </div>
    );
  }

  return content;
};

export default DayLayout;

import { FunctionComponent, useEffect, useState } from "react";
import styles from "./dayLayout.module.css";
import { useStateToggle } from "store/hooks/useStateToggle";
import { useStateClock } from "store/hooks/useStateClock";
import { useDateDataAvailability } from "api/useDateSpecificData";
import { useDateCommTranscript } from "api/useDateSpecificData";
import { useGeneralVideoIa, useGeneralVideoYt } from "api/useGeneralData";
import { useDateCacheManagement } from "api/useDateCacheManagement";
import { useParams } from "react-router-dom";
import { appSecondsFromTimeStr } from "utils/time";
import { resolveLayout } from "./configurations";
import TimelineDayContainer from "components/timelineDay/timelineDayContainer";
import Comm from "components/panes/comm";
import Articles from "components/panes/articles";
import Globe from "components/panes/globe";
import Map from "components/panes/map";
import EvaInfo from "components/panes/evaInfo";
import Video from "components/panes/video";
import EarthPhotography from "components/panes/earthPhotography";
import ExpeditionAndCrewOnboard from "components/panes/expCrewFlightWidget/expeditionsAndCrew";
import Flights from "components/panes/expCrewFlightWidget/flights";
import Widget from "components/panes/expCrewFlightWidget/widget";

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

// Component mapping for layout system
const GlobeOrMap: FunctionComponent = () => {
  const { showGlobe } = useStateToggle();
  return <>{showGlobe ? <Globe /> : <Map />}</>;
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
          <EarthPhotography />
        </div>
      );
    case "photo-tall":
      return (
        <div className={componentClass}>
          <EarthPhotography height={"tall"} />
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
  const { selectedDate, startClock, setClock } = useStateClock();
  const { dateTimeSlug } = useParams();
  const { data: dataAvailability } = useDateDataAvailability(selectedDate);
  const { data: commItems = [] } = useDateCommTranscript(selectedDate);
  const { data: videoYt = [] } = useGeneralVideoYt();
  const { data: videoIa = [] } = useGeneralVideoIa();
  const { width } = useViewport();
  const isMobile = width < 768;

  // Find YouTube recording for this date
  const videoYtRecording = videoYt?.find((recording: VideoYtItem) =>
    recording.ytStartTime.startsWith(selectedDate || "")
  );
  const videoIaRecording = videoIa?.find(
    (recording: VideoIaItem) => recording.date === selectedDate
  );

  // Manage cache when date changes
  useDateCacheManagement(selectedDate);

  // Set initial clock position and start the clock when a day loads
  useEffect(() => {
    if (!selectedDate) return;

    // Handle dateTimeSlug parameter - takes highest priority
    if (dateTimeSlug) {
      // Note: The specific time from dateTimeSlug is already set by index.tsx
      // We just start the clock since the position is already set
      startClock();
      return;
    }

    // Only set automatic clock position if no dateTimeSlug parameter was provided
    // YouTube takes priority over comm data
    if (videoYtRecording || videoIaRecording) {
      // Set the clock to the start time of the YouTube recording
      const startTimeStr = videoYtRecording?.ytStartTime.split("T")[1] || videoIaRecording?.time;
      setClock(appSecondsFromTimeStr(startTimeStr));
    } else if (commItems.length > 0) {
      // If we have comm data and no YouTube, start 10 seconds before first comm
      const firstComm = commItems[0];
      setClock(appSecondsFromTimeStr(firstComm.utteranceTime) - 10);
    }

    // Start the clock after setting position (only for non-dateTimeSlug cases)
    startClock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, dateTimeSlug, videoYtRecording, dataAvailability]);

  // Resolve the layout based on data availability
  const layout = resolveLayout(dataAvailability);

  // Determine what content should be shown for mobile layout
  const showVideo =
    layout.layout.left.some((comp) => comp.type === "video") ||
    layout.layout.center.some((comp) => comp.type === "video") ||
    layout.layout.right.some((comp) => comp.type === "video");
  const showPhotos =
    layout.layout.left.some((comp) => comp.type === "photo" || comp.type === "photo-tall") ||
    layout.layout.center.some((comp) => comp.type === "photo" || comp.type === "photo-tall") ||
    layout.layout.right.some((comp) => comp.type === "photo" || comp.type === "photo-tall");
  const showEVA =
    layout.layout.left.some((comp) => comp.type === "eva" || comp.type === "eva-long") ||
    layout.layout.center.some((comp) => comp.type === "eva" || comp.type === "eva-long") ||
    layout.layout.right.some((comp) => comp.type === "eva" || comp.type === "eva-long");
  const showComm =
    layout.layout.left.some((comp) => comp.type === "comm") ||
    layout.layout.center.some((comp) => comp.type === "comm") ||
    layout.layout.right.some((comp) => comp.type === "comm");

  let content = null;
  if (isMobile) {
    // Use mobile tabbed layout
    content = (
      <MobileLayout
        showVideo={showVideo}
        showPhotos={showPhotos}
        showEVA={showEVA}
        showComm={showComm}
      />
    );
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

// Mobile layout with tabs
type TabName = "video" | "photos" | "globe" | "comm" | "articles" | "exp/onboard" | "eva";

const MobileLayout: FunctionComponent<{
  showVideo: boolean;
  showPhotos: boolean;
  showEVA: boolean;
  showComm: boolean;
}> = ({ showVideo, showPhotos, showEVA, showComm }) => {
  const [activeTab, setActiveTab] = useState<TabName>(
    showVideo ? "video" : showPhotos ? "photos" : "globe"
  );

  // Filter available tabs based on what should be shown
  const availableTabs: TabName[] = [];
  if (showVideo) availableTabs.push("video");
  if (showPhotos) availableTabs.push("photos");
  availableTabs.push("globe");
  if (showComm) availableTabs.push("comm");
  availableTabs.push("articles");
  availableTabs.push("exp/onboard");
  if (showEVA) availableTabs.push("eva");

  // If active tab is not available anymore, select the first available tab
  useEffect(() => {
    if (
      (activeTab === "video" && !showVideo) ||
      (activeTab === "photos" && !showPhotos) ||
      (activeTab === "eva" && !showEVA) ||
      (activeTab === "comm" && !showComm)
    ) {
      setActiveTab(availableTabs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVideo, showPhotos, showEVA, showComm, activeTab]);

  return (
    <div className={styles.dayLayout}>
      <div className={styles.dayTimeline}>
        <TimelineDayContainer />
      </div>
      <div className={styles.mobileBody}>
        <div className={styles.tabs}>
          {availableTabs.map((tab) => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className={styles.tabContent}>
          {activeTab === "video" && showVideo && <Video />}
          {activeTab === "photos" && showPhotos && <EarthPhotography />}
          {activeTab === "globe" && <GlobeOrMap />}
          {activeTab === "comm" && showComm && <Comm />}
          {activeTab === "articles" && <Articles />}
          {activeTab === "exp/onboard" && <Widget />}
          {activeTab === "eva" && showEVA && <EvaInfo long={false} />}
        </div>
      </div>
    </div>
  );
};

export default DayLayout;

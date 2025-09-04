import { FunctionComponent, useEffect } from "react";
import styles from "./dayLayout2.module.css";
import { useStateToggle } from "store/hooks/useStateToggle";
import { useStateClock } from "store/hooks/useStateClock";
import { useDateDataAvailability } from "api/useDateSpecificData";
import { useDateCommTranscript } from "api/useDateSpecificData";
import { useGeneralYoutubeData } from "api/useGeneralData";
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
import YouTubeComponent from "components/panes/youtube";
import EarthPhotography from "components/panes/earthPhotography";
import ExpeditionAndCrewOnboard from "components/panes/expeditionsAndCrew/expeditionsAndCrew";
import Flights from "components/panes/flights";

// Component mapping for layout system
const GlobeOrMap: FunctionComponent = () => {
  const { showGlobe } = useStateToggle();
  return <>{showGlobe ? <Globe /> : <Map />}</>;
};

// Helper function to render a component based on type
const renderComponent = (config: ComponentConfig): JSX.Element | null => {
  const { type } = config;

  switch (type) {
    // Single components
    case "video":
      return (
        <div className={styles.componentExpandable}>
          <YouTubeComponent />
        </div>
      );
    case "eva":
    case "eva-long":
      return (
        <div className={styles.componentExpandable}>
          <EvaInfo />
        </div>
      );
    case "article":
      return (
        <div className={styles.componentExpandable}>
          <Articles />
        </div>
      );
    case "photo":
      return (
        <div className={styles.componentNaturalSize}>
          <EarthPhotography />
        </div>
      );
    case "comm":
      return (
        <div className={styles.componentExpandable}>
          <Comm showComm={true} />
        </div>
      );
    case "globe":
      return (
        <div className={styles.componentExpandable}>
          <GlobeOrMap />
        </div>
      );
    case "widget":
    case "widget-tall":
    case "widget-rest":
      return (
        <div className={styles.componentExpandable}>
          <ExpeditionAndCrewOnboard />
        </div>
      );
    case "flights":
      return (
        <div className={styles.componentExpandable}>
          <div className={styles.flightsStandalone}>
            <Flights isStandalone={true} />
          </div>
        </div>
      );

    // Combined components - these need special handling
    case "video-eva":
    case "video-eva-long":
    case "video-eva-article":
    case "video-article":
      return (
        <div className={styles.multiComponent}>
          <div className={styles.componentExpandable}>
            <YouTubeComponent />
          </div>
          {type.includes("eva") && (
            <div className={styles.componentExpandable}>
              <EvaInfo />
            </div>
          )}
          {type.includes("article") && (
            <div className={styles.componentExpandable}>
              <Articles />
            </div>
          )}
        </div>
      );

    case "eva-article":
      return (
        <div className={styles.multiComponent}>
          <div className={styles.componentExpandable}>
            <EvaInfo />
          </div>
          <div className={styles.componentExpandable}>
            <Articles />
          </div>
        </div>
      );

    case "photo-widget":
      return (
        <div className={styles.multiComponent}>
          <div className={styles.componentNaturalSize}>
            <EarthPhotography />
          </div>
          <div className={styles.componentExpandable}>
            <ExpeditionAndCrewOnboard />
          </div>
        </div>
      );

    case "photo-article":
      return (
        <div className={styles.multiComponent}>
          <div className={styles.componentNaturalSize}>
            <EarthPhotography />
          </div>
          <div className={styles.componentExpandable}>
            <Articles />
          </div>
        </div>
      );

    case "photo-eva-long":
      return (
        <div className={styles.multiComponent}>
          <div className={styles.componentNaturalSize}>
            <EarthPhotography />
          </div>
          <div className={styles.componentExpandable}>
            <EvaInfo />
          </div>
        </div>
      );

    case "globe-widget":
    case "globe-widget-rest":
      return (
        <div className={styles.multiComponent}>
          <div className={styles.componentExpandable}>
            <GlobeOrMap />
          </div>
          <div className={styles.componentExpandable}>
            <ExpeditionAndCrewOnboard />
          </div>
        </div>
      );

    default:
      console.warn(`Unknown component type: ${type}`);
      return <div className={styles.placeholder}>Unknown: {type}</div>;
  }
};

// Helper function to render multiple components in a column
const renderColumn = (components: ComponentConfig[]): JSX.Element => {
  if (components.length === 0) {
    return <div className={styles.placeholder}>Empty Column</div>;
  }

  if (components.length === 1) {
    return <div className={styles.columnSingle}>{renderComponent(components[0])}</div>;
  }

  // Multiple components - stack them vertically
  return (
    <div className={styles.columnMultiple}>
      {components.map((component, index) => (
        <div key={`${component.type}-${index}`} className={styles.columnSection}>
          {renderComponent(component)}
        </div>
      ))}
    </div>
  );
};

const DayLayout2: FunctionComponent = () => {
  const { selectedDate, startClock, setClock } = useStateClock();
  const { dateTimeSlug } = useParams();
  const { data: dataAvailability } = useDateDataAvailability(selectedDate);
  const { data: commItems = [] } = useDateCommTranscript(selectedDate);
  const { data: youtubeLiveRecordings = [] } = useGeneralYoutubeData();

  // Find YouTube recording for this date
  const youtubeLiveRecording = youtubeLiveRecordings?.find((recording: YoutubeLiveRecording) =>
    recording.startTime.startsWith(selectedDate || "")
  );

  // Manage cache when date changes
  useDateCacheManagement(selectedDate);

  // Set initial clock position and start the clock when a day loads
  useEffect(() => {
    if (!selectedDate) return;

    // Resolve the layout based on data availability and log it once
    const layout = resolveLayout(dataAvailability);
    if (import.meta.env.DEV) {
      console.log("🎨 Layout resolved:", layout);
    }

    // Handle dateTimeSlug parameter - takes highest priority
    if (dateTimeSlug) {
      // Note: The specific time from dateTimeSlug is already set by index.tsx
      // We just start the clock since the position is already set
      startClock();
      return;
    }

    // Only set automatic clock position if no dateTimeSlug parameter was provided
    // YouTube takes priority over comm data
    if (youtubeLiveRecording) {
      // Set the clock to the start time of the YouTube recording
      const startTimeStr = youtubeLiveRecording.startTime.split("T")[1];
      setClock(appSecondsFromTimeStr(startTimeStr));
    } else if (commItems.length > 0) {
      // If we have comm data and no YouTube, start 10 seconds before first comm
      const firstComm = commItems[0];
      setClock(appSecondsFromTimeStr(firstComm.utteranceTime) - 10);
    }

    // Start the clock after setting position (only for non-dateTimeSlug cases)
    startClock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, dateTimeSlug, youtubeLiveRecording, dataAvailability]);

  // Resolve the layout based on data availability
  const layout = resolveLayout(dataAvailability);

  return (
    <div className={styles.dayLayout}>
      {/* Timeline at the top */}
      <div className={styles.timeline}>
        <TimelineDayContainer />
      </div>

      {/* Three column body layout */}
      <div className={styles.body}>
        <div className={styles.leftColumn}>{renderColumn(layout.layout.left)}</div>

        <div className={styles.centerColumn}>{renderColumn(layout.layout.center)}</div>

        <div className={styles.rightColumn}>{renderColumn(layout.layout.right)}</div>
      </div>
    </div>
  );
};

export default DayLayout2;

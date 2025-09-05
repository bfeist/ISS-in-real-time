import { FunctionComponent, useEffect } from "react";
import styles from "./dayLayout.module.css";
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
import ExpeditionAndCrewOnboard from "components/panes/expCrewFlightWidget/expeditionsAndCrew";
import Flights from "components/panes/expCrewFlightWidget/flights";
import Widget from "components/panes/expCrewFlightWidget/widget";

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
          <YouTubeComponent />
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
        {renderColumn(layout.layout.left, styles.leftColumn)}

        {renderColumn(layout.layout.center, styles.centerColumn)}

        {renderColumn(layout.layout.right, styles.rightColumn)}
      </div>
    </div>
  );
};

export default DayLayout;

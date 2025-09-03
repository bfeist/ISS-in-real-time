import { FunctionComponent, useState, useEffect } from "react";
import styles from "./dayLayout.module.css";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
import { useStateToggle } from "store/hooks/useStateToggle";
import { useStateClock } from "store/hooks/useStateClock";
import { useDateDataAvailability } from "api/useDateSpecificData";
import { useDateCommTranscript } from "api/useDateSpecificData";
import { useGeneralYoutubeData } from "api/useGeneralData";
import { useDateCacheManagement } from "api/useDateCacheManagement";
import { useParams } from "react-router-dom";
import { appSecondsFromTimeStr } from "utils/time";
import Comm from "components/panes/comm";
import Articles from "components/panes/articles";
import Globe from "components/panes/globe";
import Map from "components/panes/map";
import EvaInfo from "components/panes/evaInfo";
import YouTubeComponent from "components/panes/youtube";
import EarthPhotography from "components/panes/earthPhotography";
import TimelineDayContainer from "components/timelineDay/timelineDayContainer";
import ExpeditionAndCrewOnboard from "components/panes/expeditionsAndCrew/expeditionsAndCrew";

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
          {activeTab === "video" && showVideo && <YouTubeComponent />}
          {activeTab === "photos" && showPhotos && <EarthPhotography />}
          {activeTab === "globe" && <GlobeOrMap />}
          {activeTab === "comm" && showComm && <Comm showComm={showComm} />}
          {activeTab === "articles" && <Articles />}
          {activeTab === "exp/onboard" && <ExpeditionAndCrewOnboard />}
          {activeTab === "eva" && showEVA && <EvaInfo />}
        </div>
      </div>
    </div>
  );
};

const VideoPhotos: FunctionComponent<{
  showEVA: boolean;
  showComm: boolean;
}> = ({ showEVA, showComm }) => {
  return (
    <div className={styles.dayLayout}>
      <div className={styles.dayTimeline}>
        <TimelineDayContainer />
      </div>
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <div className={styles.bodyLeftTop}>
            <YouTubeComponent />
          </div>
          <div className={styles.bodyLeftBottom}>
            <Articles />
            <ExpeditionAndCrewOnboard />
            {showEVA && <EvaInfo />}
          </div>
        </div>
        <div className={styles.bodyCenter}>
          <div className={styles.bodyCenterTop}>
            <EarthPhotography />
          </div>
          <div className={styles.bodyCenterBottom}>
            <GlobeOrMap />
          </div>
        </div>
        <div className={styles.bodyRight}>
          <Comm showComm={showComm} />
        </div>
      </div>
    </div>
  );
};

const VideoOnly: FunctionComponent<{
  showEVA: boolean;
  showComm: boolean;
}> = ({ showEVA, showComm }) => {
  return (
    <div className={styles.dayLayout}>
      <div className={styles.dayTimeline}>
        <TimelineDayContainer />
      </div>
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <div className={styles.bodyLeftTop}>
            <YouTubeComponent />
          </div>
          <div className={styles.bodyLeftBottom}>
            <ExpeditionAndCrewOnboard />
            {showEVA && <EvaInfo />}
          </div>
        </div>
        <div className={styles.bodyCenter}>
          <div className={styles.bodyCenterTop}>
            <Articles />
          </div>
          <div className={styles.bodyCenterBottom}>
            <GlobeOrMap />
          </div>
        </div>
        <div className={styles.bodyRight}>
          <Comm showComm={showComm} />
        </div>
      </div>
    </div>
  );
};

const PhotosOnly: FunctionComponent<{
  showEVA: boolean;
  showComm: boolean;
}> = ({ showEVA, showComm }) => {
  return (
    <div className={styles.dayLayout}>
      <div className={styles.dayTimeline}>
        <TimelineDayContainer />
      </div>
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <div className={styles.bodyLeftTop}>
            <EarthPhotography />
          </div>
          <div className={styles.bodyLeftBottom}>
            <ExpeditionAndCrewOnboard />
            {showEVA && <EvaInfo />}
          </div>
        </div>
        <div className={styles.bodyCenter}>
          <div className={styles.bodyCenterTop}>
            <Articles />
          </div>
          <div className={styles.bodyCenterBottom}>
            <GlobeOrMap />
          </div>
        </div>

        <div className={styles.bodyRight}>
          <Comm showComm={showComm} />
        </div>
      </div>
    </div>
  );
};

const NoPhotosOrVideo: FunctionComponent<{
  showEVA: boolean;
  showComm: boolean;
}> = ({ showEVA, showComm }) => {
  return (
    <div className={styles.dayLayout}>
      <div className={styles.dayTimeline}>
        <TimelineDayContainer />
      </div>
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <Articles />
        </div>
        <div className={styles.bodyCenter}>
          <div className={styles.bodyCenterTop}>
            <ExpeditionAndCrewOnboard />
            {showEVA && <EvaInfo />}
          </div>
          <div className={styles.bodyCenterBottom}>
            <GlobeOrMap />
          </div>
        </div>
        <div className={styles.bodyRight}>
          <Comm showComm={showComm} />
        </div>
      </div>
    </div>
  );
};

const GlobeOrMap: FunctionComponent = () => {
  const { showGlobe } = useStateToggle();
  return <>{showGlobe ? <Globe /> : <Map />}</>;
};

const Layout: FunctionComponent = () => {
  const { selectedDate } = useStateSelectedDate();
  const { startClock, setClock } = useStateClock();
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

    // Start the clock after setting position
    startClock();
  }, [selectedDate, commItems, youtubeLiveRecording, dateTimeSlug, setClock, startClock]);

  const { width } = useViewport();
  const isMobile = width <= 1000;

  const showVideo = dataAvailability?.youtube || false;
  const showPhotos = dataAvailability?.earthPhotography || false;
  const showEVA = dataAvailability?.eva || false;
  const showComm = dataAvailability?.comm || dataAvailability?.vvComm || false;

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
    // Use desktop layouts
    if (showVideo && showPhotos) {
      content = <VideoPhotos showEVA={showEVA} showComm={showComm} />;
    } else if (showVideo) {
      content = <VideoOnly showEVA={showEVA} showComm={showComm} />;
    } else if (showPhotos) {
      content = <PhotosOnly showEVA={showEVA} showComm={showComm} />;
    } else {
      content = <NoPhotosOrVideo showEVA={showEVA} showComm={showComm} />;
    }
  }

  return content;
};

export default Layout;

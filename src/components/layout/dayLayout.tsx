import { FunctionComponent, useState, useEffect } from "react";
import styles from "./dayLayout.module.css";
import { useStateSelectedDate, useStateToggle } from "store";
import { useDateDataAvailability } from "api/useDateSpecificData";
import Comm from "components/comm";
import Blog from "components/blog";
import Globe from "components/globe";
import Map from "components/map";
import Flights from "components/flights";
import CrewOnboard from "components/crewOnboard";
import Expeditions from "components/expedition";

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

// Add the new type definition for section names
type SectionName =
  | "header"
  | "timeline"
  | "globe"
  | "comm"
  | "video"
  | "photos"
  | "articles"
  | "flights"
  | "exp/onboard"
  | "eva";

const FakeSection: FunctionComponent<{ name: SectionName; available?: boolean }> = ({
  name,
  available = true,
}) => {
  const sectionColor: Record<SectionName, string> = {
    header: "lightblue",
    timeline: "red",
    globe: "lightgreen",
    comm: "lightgrey",
    video: "lightcoral",
    photos: "lightcyan",
    articles: "lightpink",
    flights: "#ffcc99",
    "exp/onboard": "lightgoldenrodyellow",
    eva: "lightblue",
  };
  return (
    <div
      className={styles.fakeSection}
      data-section={name}
      style={{
        backgroundColor: sectionColor[name],
      }}
    >
      {name} {available ? "" : " (not available)"}
    </div>
  );
};

// Mobile layout with tabs
type TabName =
  | "video"
  | "photos"
  | "globe"
  | "comm"
  | "articles"
  | "flights"
  | "exp/onboard"
  | "eva";

const MobileLayout: FunctionComponent<{
  showVideo: boolean;
  showPhotos: boolean;
  showArticles: boolean;
  showEVA: boolean;
  showComm: boolean;
}> = ({ showVideo, showPhotos, showArticles, showEVA, showComm }) => {
  const [activeTab, setActiveTab] = useState<TabName>(
    showVideo ? "video" : showPhotos ? "photos" : "globe"
  );

  // Filter available tabs based on what should be shown
  const availableTabs: TabName[] = [];
  if (showVideo) availableTabs.push("video");
  if (showPhotos) availableTabs.push("photos");
  availableTabs.push("globe");
  if (showComm) availableTabs.push("comm");
  if (showArticles) availableTabs.push("articles");
  availableTabs.push("flights");
  availableTabs.push("exp/onboard");
  if (showEVA) availableTabs.push("eva");

  // If active tab is not available anymore, select the first available tab
  useEffect(() => {
    if (
      (activeTab === "video" && !showVideo) ||
      (activeTab === "photos" && !showPhotos) ||
      (activeTab === "articles" && !showArticles) ||
      (activeTab === "eva" && !showEVA) ||
      (activeTab === "comm" && !showComm)
    ) {
      setActiveTab(availableTabs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVideo, showPhotos, showArticles, showEVA, showComm, activeTab]);

  return (
    <div className={styles.dayLayout}>
      <div className={styles.dayTimeline}>
        <FakeSection name="timeline" />
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
          {activeTab === "video" && showVideo && <FakeSection name="video" />}
          {activeTab === "photos" && showPhotos && <FakeSection name="photos" />}
          {activeTab === "globe" && <FakeSection name="globe" />}
          {activeTab === "comm" && showComm && <FakeSection name="comm" />}
          {activeTab === "articles" && showArticles && <FakeSection name="articles" />}
          {activeTab === "flights" && <FakeSection name="flights" />}
          {activeTab === "exp/onboard" && <FakeSection name="exp/onboard" />}
          {activeTab === "eva" && showEVA && <FakeSection name="eva" />}
        </div>
      </div>
    </div>
  );
};

const VideoPhotos: FunctionComponent<{
  showEVA: boolean;
  showComm: boolean;
  showArticles: boolean;
}> = ({ showEVA, showComm, showArticles }) => {
  return (
    <div className={styles.dayLayout}>
      <div className={styles.dayTimeline}>
        <FakeSection name="timeline" />
      </div>
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <div className={styles.bodyLeftTop}>
            <FakeSection name="video" />
          </div>
          <div className={styles.bodyLeftBottom}>
            <Blog showArticles={showArticles} />
            <Flights />
            <FakeSection name="exp/onboard" />
            {showEVA && <FakeSection name="eva" />}
          </div>
        </div>
        <div className={styles.bodyCenter}>
          <div className={styles.bodyCenterTop}>
            <FakeSection name="photos" />
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
  showArticles: boolean;
}> = ({ showEVA, showComm, showArticles }) => {
  return (
    <div className={styles.dayLayout}>
      <div className={styles.dayTimeline}>
        <FakeSection name="timeline" />
      </div>
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <div className={styles.bodyLeftTop}>
            <FakeSection name="video" />
          </div>
          <div className={styles.bodyLeftBottom}>
            <Flights />
            <ExpeditionAndCrewOnboard />
            {showEVA && <FakeSection name="eva" />}
          </div>
        </div>
        <div className={styles.bodyCenter}>
          <div className={styles.bodyCenterTop}>
            <Blog showArticles={showArticles} />
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
  showArticles: boolean;
}> = ({ showEVA, showComm, showArticles }) => {
  return (
    <div className={styles.dayLayout}>
      <div className={styles.dayTimeline}>
        <FakeSection name="timeline" />
      </div>
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <div className={styles.bodyLeftTop}>
            <FakeSection name="photos" />
          </div>
          <div className={styles.bodyLeftBottom}>
            <Flights />
            <ExpeditionAndCrewOnboard />
            {showEVA && <FakeSection name="eva" />}
          </div>
        </div>
        <div className={styles.bodyCenter}>
          <div className={styles.bodyCenterTop}>
            <Blog showArticles={showArticles} />
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
  showArticles: boolean;
}> = ({ showEVA, showComm, showArticles }) => {
  return (
    <div className={styles.dayLayout}>
      <div className={styles.dayTimeline}>
        <FakeSection name="timeline" />
      </div>
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <Blog showArticles={showArticles} />
        </div>
        <div className={styles.bodyCenter}>
          <div className={styles.bodyCenterTop}>
            <Flights />
            <ExpeditionAndCrewOnboard />
            {showEVA && <FakeSection name="eva" />}
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

const ExpeditionAndCrewOnboard: FunctionComponent = () => {
  return (
    <div className={styles.expeditionsAndCrewOnboard}>
      <Expeditions />
      <CrewOnboard />
    </div>
  );
};

const Layout: FunctionComponent = () => {
  const { selectedDate } = useStateSelectedDate();
  const { data: dataAvailability } = useDateDataAvailability(selectedDate);

  const { width } = useViewport();
  const isMobile = width <= 1000;

  const showVideo = dataAvailability?.youtube || false;
  const showPhotos = dataAvailability?.earthPhotography || false;
  const showArticles = dataAvailability?.blog || dataAvailability?.activitySummary || false;
  const showEVA = dataAvailability?.eva || false;
  const showComm = dataAvailability?.comm || dataAvailability?.vvComm || false;

  let content = null;
  if (isMobile) {
    // Use mobile tabbed layout
    content = (
      <MobileLayout
        showVideo={showVideo}
        showPhotos={showPhotos}
        showArticles={showArticles}
        showEVA={showEVA}
        showComm={showComm}
      />
    );
  } else {
    // Use desktop layouts
    if (showVideo && showPhotos) {
      content = <VideoPhotos showEVA={showEVA} showComm={showComm} showArticles={showArticles} />;
    } else if (showVideo) {
      content = <VideoOnly showEVA={showEVA} showComm={showComm} showArticles={showArticles} />;
    } else if (showPhotos) {
      content = <PhotosOnly showEVA={showEVA} showComm={showComm} showArticles={showArticles} />;
    } else {
      content = (
        <NoPhotosOrVideo showEVA={showEVA} showComm={showComm} showArticles={showArticles} />
      );
    }
  }

  return content;
};

export default Layout;

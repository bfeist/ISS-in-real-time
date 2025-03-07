import { useNavigate } from "react-router-dom";
import { FunctionComponent, useState, useEffect } from "react";
import styles from "./layout_test.module.css";

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

// Update LayoutTestControls for independent toggles
const LayoutTestControls: FunctionComponent<{
  showVideo: boolean;
  showPhotos: boolean;
  onToggleVideo: (state: boolean) => void;
  onTogglePhotos: (state: boolean) => void;
}> = ({ showVideo, showPhotos, onToggleVideo, onTogglePhotos }) => {
  const navigate = useNavigate();
  return (
    <div className={styles.layoutTest}>
      <button onClick={() => navigate("/")}>Back</button>
      <button onClick={() => onToggleVideo(!showVideo)}>Video: {showVideo ? "ON" : "OFF"}</button>
      <button onClick={() => onTogglePhotos(!showPhotos)}>
        Photos: {showPhotos ? "ON" : "OFF"}
      </button>
    </div>
  );
};

// Add the new type definition for section names
type SectionName = "header" | "timeline" | "globe" | "transcript" | "video" | "photos" | "details";

const FakeSection: FunctionComponent<{ name: SectionName }> = ({ name }) => {
  const sectionColor: Record<SectionName, string> = {
    header: "lightblue",
    timeline: "red",
    globe: "lightgreen",
    transcript: "lightyellow",
    video: "lightcoral",
    photos: "lightcyan",
    details: "lightpink",
  };
  return (
    <div
      className={styles.fakeSection}
      data-section={name}
      style={{
        backgroundColor: sectionColor[name],
      }}
    >
      {name}
    </div>
  );
};

// Mobile layout with tabs
type TabName = "video" | "photos" | "globe" | "transcript";

const MobileLayout: FunctionComponent<{ showVideo: boolean; showPhotos: boolean }> = ({
  showVideo,
  showPhotos,
}) => {
  const [activeTab, setActiveTab] = useState<TabName>(
    showVideo ? "video" : showPhotos ? "photos" : "globe"
  );

  // Filter available tabs based on what should be shown

  const availableTabs: TabName[] = [];
  if (showVideo) availableTabs.push("video");
  if (showPhotos) availableTabs.push("photos");
  availableTabs.push("globe");
  availableTabs.push("transcript");

  // If active tab is not available anymore, select the first available tab
  useEffect(() => {
    if ((activeTab === "video" && !showVideo) || (activeTab === "photos" && !showPhotos)) {
      setActiveTab(availableTabs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVideo, showPhotos, activeTab]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <FakeSection name="header" />
        </div>
        <div className={styles.headerBottom}>
          <FakeSection name="timeline" />
        </div>
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
          {activeTab === "transcript" && <FakeSection name="transcript" />}
        </div>
        <div className={styles.mobileDetails}>
          <FakeSection name="details" />
        </div>
      </div>
    </div>
  );
};

const VideoPhotos: FunctionComponent = () => {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <FakeSection name="header" />
        </div>
        <div className={styles.headerBottom}>
          <FakeSection name="timeline" />
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <div className={styles.bodyLeftTop}>
            <FakeSection name="video" />
          </div>
          <div className={styles.bodyLeftBottom}>
            <FakeSection name="details" />
          </div>
        </div>
        <div className={styles.bodyCenter}>
          <div className={styles.bodyCenterTop}>
            <FakeSection name="photos" />
          </div>
          <div className={styles.bodyCenterBottom}>
            <FakeSection name="globe" />
          </div>
        </div>
        <div className={styles.bodyRight}>
          <FakeSection name="transcript" />
        </div>
      </div>
    </div>
  );
};

const VideoOnly: FunctionComponent = () => {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <FakeSection name="header" />
        </div>
        <div className={styles.headerBottom}>
          <FakeSection name="timeline" />
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <div className={styles.bodyLeftTop}>
            <FakeSection name="video" />
          </div>
          <div className={styles.bodyLeftBottom}>
            <FakeSection name="details" />
          </div>
        </div>
        <div className={styles.bodyCenter}>
          <FakeSection name="globe" />
        </div>
        <div className={styles.bodyRight}>
          <FakeSection name="transcript" />
        </div>
      </div>
    </div>
  );
};

const PhotosOnly: FunctionComponent = () => {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <FakeSection name="header" />
        </div>
        <div className={styles.headerBottom}>
          <FakeSection name="timeline" />
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <div className={styles.bodyLeftTop}>
            <FakeSection name="photos" />
          </div>
          <div className={styles.bodyLeftBottom}>
            <FakeSection name="details" />
          </div>
        </div>
        <div className={styles.bodyCenter}>
          <FakeSection name="globe" />
        </div>
        <div className={styles.bodyRight}>
          <FakeSection name="transcript" />
        </div>
      </div>
    </div>
  );
};

const NoPhotosOrVideo: FunctionComponent = () => {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <FakeSection name="header" />
        </div>
        <div className={styles.headerBottom}>
          <FakeSection name="timeline" />
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <FakeSection name="details" />
        </div>
        <div className={styles.bodyCenter}>
          <FakeSection name="globe" />
        </div>
        <div className={styles.bodyRight}>
          <FakeSection name="transcript" />
        </div>
      </div>
    </div>
  );
};

const LayoutTest: FunctionComponent = () => {
  // Two independent toggles
  const [showVideo, setShowVideo] = useState(true);
  const [showPhotos, setShowPhotos] = useState(true);
  const { width } = useViewport();
  const isMobile = width <= 1000;

  let content = null;
  if (isMobile) {
    // Use mobile tabbed layout
    content = <MobileLayout showVideo={showVideo} showPhotos={showPhotos} />;
  } else {
    // Use desktop layouts
    if (showVideo && showPhotos) {
      content = <VideoPhotos />;
    } else if (showVideo) {
      content = <VideoOnly />;
    } else if (showPhotos) {
      content = <PhotosOnly />;
    } else {
      content = <NoPhotosOrVideo />;
    }
  }

  return (
    <div className={styles.outerWrapper}>
      <LayoutTestControls
        showVideo={showVideo}
        showPhotos={showPhotos}
        onToggleVideo={setShowVideo}
        onTogglePhotos={setShowPhotos}
      />
      {content}
    </div>
  );
};

export default LayoutTest;

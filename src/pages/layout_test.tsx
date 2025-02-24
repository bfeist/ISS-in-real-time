import { useNavigate } from "react-router-dom";
import { FunctionComponent, useState } from "react";
import styles from "./layout_test.module.css";

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
    details: "lightgoldenrodyellow",
  };
  return (
    <div
      className={styles.fakeSection}
      style={{
        backgroundColor: sectionColor[name],
      }}
    >
      {name}
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

  let content = null;
  if (showVideo && showPhotos) {
    content = <VideoPhotos />;
  } else if (showVideo) {
    content = <VideoOnly />;
  } else if (showPhotos) {
    content = <PhotosOnly />;
  } else {
    content = <NoPhotosOrVideo />;
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

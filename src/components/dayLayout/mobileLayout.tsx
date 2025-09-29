import { FunctionComponent, useEffect, useState } from "react";
import TimelineDayContainer from "components/timelineDay/timelineDayContainer";
import Comm from "components/panes/comm";
import Articles from "components/panes/articles";
import Video from "components/panes/video";
import Photos from "components/panes/photos";
import Widget from "components/panes/expCrewFlightWidget/widget";
import EvaInfo from "components/panes/evaInfo";
import { GlobeOrMap } from "./globeOrMap";
import styles from "./mobileLayout.module.css";

export type TabName = "video" | "photos" | "globe" | "comm" | "articles" | "exp/onboard" | "eva";

interface MobileLayoutProps {
  tabs: TabName[];
}

const MobileLayout: FunctionComponent<MobileLayoutProps> = ({ tabs }) => {
  const [activeTab, setActiveTab] = useState<TabName>(() => tabs[0] ?? "globe");

  useEffect(() => {
    if (tabs.length === 0) {
      return;
    }

    if (!tabs.includes(activeTab)) {
      setActiveTab(tabs[0]);
    }
  }, [tabs, activeTab]);

  const renderActiveTab = (tab: TabName) => {
    switch (tab) {
      case "video":
        return <Video />;
      case "photos":
        return <Photos />;
      case "globe":
        return <GlobeOrMap />;
      case "comm":
        return <Comm />;
      case "articles":
        return <Articles />;
      case "exp/onboard":
        return <Widget />;
      case "eva":
        return <EvaInfo long={false} />;
      default:
        return null;
    }
  };

  const currentTab = tabs.length === 0 ? null : tabs.includes(activeTab) ? activeTab : tabs[0];

  return (
    <div className={styles.mobileLayout}>
      <div className={styles.dayTimeline}>
        <TimelineDayContainer />
      </div>
      <div className={styles.mobileBody}>
        {tabs.length > 0 && (
          <div className={styles.tabs}>
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`${styles.tab} ${currentTab === tab ? styles.activeTab : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
        <div className={styles.tabContent}>
          {currentTab ? (
            renderActiveTab(currentTab)
          ) : (
            <div className={styles.placeholder}>No content available for this day.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileLayout;

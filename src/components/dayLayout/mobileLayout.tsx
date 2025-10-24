import { FunctionComponent, useEffect, useRef, useState } from "react";
import TimelineDayContainer from "components/timelineDay/timelineDayContainer";
import Comm from "components/panes/comm";
import Articles from "components/panes/articles";
import Video from "components/panes/video";
import Photos from "components/panes/photos";
import Widget from "components/panes/expCrewFlightWidget/widget";
import EvaInfo from "components/panes/evaInfo";
import { GlobeOrMap } from "./globeOrMap";
import styles from "./mobileLayout.module.css";

export type TabName = "video" | "photos" | "orbit" | "comm" | "articles" | "onboard" | "eva";

interface MobileLayoutProps {
  tabs: TabName[];
}

const MobileLayout: FunctionComponent<MobileLayoutProps> = ({ tabs }) => {
  const getDefaultTab = (availableTabs: TabName[]): TabName => {
    const priorities: TabName[] = ["video", "comm", "photos", "articles", "orbit"];
    for (const priority of priorities) {
      if (availableTabs.includes(priority)) {
        return priority;
      }
    }
    return "orbit"; // Fallback if no preferred tabs are available
  };

  const [activeTab, setActiveTab] = useState<TabName>(() => getDefaultTab(tabs));
  const tabsRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [userSelectedTab, setUserSelectedTab] = useState(false);

  useEffect(() => {
    if (tabs.length === 0) {
      return;
    }
    // Always update to the highest priority tab when tabs change, unless user has manually selected a tab
    if (!userSelectedTab) {
      const defaultTab = getDefaultTab(tabs);
      if (defaultTab !== activeTab) {
        setActiveTab(defaultTab);
      }
    } else if (!tabs.includes(activeTab)) {
      // If user selected a tab but it's no longer available, reset to default
      setActiveTab(getDefaultTab(tabs));
      setUserSelectedTab(false);
    }
  }, [tabs, activeTab, userSelectedTab]);

  useEffect(() => {
    if (tabsRef.current) {
      const checkOverflow = () => {
        const element = tabsRef.current;
        if (element) {
          setIsOverflowing(element.scrollWidth > element.clientWidth);
        }
      };

      checkOverflow();

      const handleResize = () => checkOverflow();
      window.addEventListener("resize", handleResize);

      return () => window.removeEventListener("resize", handleResize);
    }
  }, [tabs]);

  const renderActiveTab = (tab: TabName) => {
    switch (tab) {
      case "video":
        return <Video />;
      case "photos":
        return <Photos />;
      case "orbit":
        return <GlobeOrMap />;
      case "comm":
        return <Comm />;
      case "articles":
        return <Articles />;
      case "onboard":
        return <Widget />;
      case "eva":
        return <EvaInfo long={false} />;
      default:
        return null;
    }
  };

  const currentTab = tabs.length === 0 ? null : activeTab;

  return (
    <div className={styles.mobileLayout}>
      <div className={styles.dayTimeline}>
        <TimelineDayContainer />
      </div>
      <div className={styles.mobileBody}>
        {tabs.length > 0 && (
          <div
            ref={tabsRef}
            className={`${styles.tabs} ${isOverflowing ? styles.tabsOverflow : ""}`}
          >
            {tabs.map((tab) => (
              <div
                key={tab}
                role="button"
                tabIndex={0}
                className={`${styles.tab} ${currentTab === tab ? styles.activeTab : ""}`}
                onClick={() => {
                  setActiveTab(tab);
                  setUserSelectedTab(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveTab(tab);
                    setUserSelectedTab(true);
                  }
                }}
                aria-pressed={currentTab === tab}
              >
                {tab}
              </div>
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

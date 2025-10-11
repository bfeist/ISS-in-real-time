import React, { FunctionComponent, useMemo } from "react";
import styles from "./highlightNotableMoments.module.css";
import { useStateSearch } from "store/hooks/useStateSearch";
import { useStateClock } from "store/hooks/useStateClock";
import { useGeneralNotableMoments } from "api/useGeneralData";
import HighlightType, { HighlightTypeConfig } from "./highlightType";
import { useStateToggle } from "store/hooks/useStateToggle";

interface HighlightNotableMomentsProps {}

const HighlightNotableMoments: FunctionComponent<HighlightNotableMomentsProps> = () => {
  const { data: notableData } = useGeneralNotableMoments();
  const { selectedNotableMoment, setSelectedNotableMoment } = useStateSearch();
  const { setSelectedDate } = useStateClock();
  const { setShowTimelineYears } = useStateToggle();

  // Generate Notable Moments list for display (sorted by datetime ascending from API)
  const notableItems: NotableMomentItem[] = useMemo(() => {
    if (!notableData || notableData.length === 0) {
      return [];
    }
    return notableData.slice();
  }, [notableData]);

  const formatDateTime = (datetime: string) => {
    const date = new Date(datetime);

    const formatOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };

    const dateStr = date.toLocaleDateString("en-US", formatOptions);
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    return `${dateStr} ${timeStr}`;
  };

  const handleGoToMoment = (datetime: string) => {
    // Extract just the date part (YYYY-MM-DD) from the datetime string
    const dateOnly = datetime.split("T")[0];
    setSelectedDate(dateOnly);
    // close the years dropdown
    setShowTimelineYears(false);
  };

  // Configuration for the generic HighlightType component
  const config: HighlightTypeConfig<NotableMomentItem> = {
    items: notableItems,
    selectedItem: selectedNotableMoment,
    setSelectedItem: setSelectedNotableMoment,
    placeholder: "Filter notable moments...",
    ariaLabel: "Notable moments list",
    clearAllTitle: "Clear notable moments highlights",
    itemClassName: "notableItem",
    getItemKey: (item) => item.datetime,
    renderItem: (item) => {
      const isSelected =
        selectedNotableMoment !== null && selectedNotableMoment.datetime === item.datetime;
      return (
        <div className={styles.notableItemContent}>
          {isSelected && (
            <button
              className={styles.goButton}
              onClick={(e) => {
                e.stopPropagation();
                handleGoToMoment(item.datetime);
              }}
              title="Go to this date and time"
            >
              GO
            </button>
          )}
          <div className={styles.notableDescription}>{item.description}</div>
          <div className={styles.notableDateTime}>{formatDateTime(item.datetime)}</div>
        </div>
      );
    },
    filterItem: (item, searchTerm) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        item.description.toLowerCase().includes(searchLower) || item.datetime.includes(searchTerm)
      );
    },
    isItemEqual: (item1, item2) => item1?.datetime === item2.datetime,
  };

  return <HighlightType config={config} />;
};

// Dummy references to satisfy CSS modules linter for classes used dynamically by HighlightType
const _unusedNotableItem = styles.notableItem;
const _unusedSelected = styles.selected;
const _unusedGoButton = styles.goButton;

export default HighlightNotableMoments;

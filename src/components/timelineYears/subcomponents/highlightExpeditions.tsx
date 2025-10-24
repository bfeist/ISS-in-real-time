import React, { FunctionComponent, useMemo } from "react";
import styles from "./highlightExpeditions.module.css";
import { useStateSearch } from "store/hooks/useStateSearch";
import { useGeneralExpeditionInfo } from "api/useGeneralData";
import HighlightType, { HighlightTypeConfig } from "./highlightType";

interface HighlightExpeditionsProps {}

const HighlightExpeditions: FunctionComponent<HighlightExpeditionsProps> = () => {
  const { data: expeditionInfo } = useGeneralExpeditionInfo();
  const { selectedExpedition, setSelectedExpedition } = useStateSearch();

  // Generate expedition list for display
  const expeditions: ExpeditionInfo[] = useMemo(() => {
    if (!expeditionInfo || expeditionInfo.length === 0) {
      return [];
    }
    // Sort expeditions by expedition number in descending order (most recent first)
    return expeditionInfo.slice().sort((a, b) => b.expedition - a.expedition);
  }, [expeditionInfo]);

  const formatDateRange = (start: string, end: string | null) => {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : null;

    const formatOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };

    const endFormatted =
      !end || !endDate || isNaN(endDate.getTime())
        ? "TBD"
        : endDate.toLocaleDateString("en-US", formatOptions);

    return `${startDate.toLocaleDateString("en-US", formatOptions)} - ${endFormatted}`;
  };

  // Configuration for the generic HighlightType component
  const config: HighlightTypeConfig<ExpeditionInfo> = {
    items: expeditions,
    selectedItem: selectedExpedition,
    setSelectedItem: setSelectedExpedition,
    placeholder: "Filter expeditions...",
    ariaLabel: "Expeditions list",
    clearAllTitle: "Clear expedition highlights",
    itemClassName: "expeditionItem",
    getItemKey: (item) => item.expedition.toString(),
    renderItem: (item) => (
      <div className={styles.expeditionNumber}>
        Expedition {item.expedition} -{" "}
        <span className={styles.expeditionDate}>{formatDateRange(item.start, item.end)}</span>
      </div>
    ),
    filterItem: (item, searchTerm) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        item.expedition.toString().includes(searchTerm) ||
        item.expeditionBlurb?.toLowerCase().includes(searchLower)
      );
    },
    isItemEqual: (item1, item2) => item1?.expedition === item2.expedition,
  };

  return <HighlightType config={config} />;
};

// Dummy references to satisfy CSS modules linter for classes used dynamically by HighlightType
const _unusedExpeditionItem = styles.expeditionItem;
const _unusedSelected = styles.selected;

export default HighlightExpeditions;

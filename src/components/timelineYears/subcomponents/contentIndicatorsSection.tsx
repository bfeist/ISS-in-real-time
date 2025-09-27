import React, { FunctionComponent, useMemo } from "react";
import { useGeneralDataAvailabilities } from "api/useGeneralData";
import styles from "./contentIndicatorsSection.module.css";

interface ContentIndicatorsSectionProps {
  hoveredDate: string | null;
  compact?: boolean;
}

const ContentIndicatorsSection: FunctionComponent<ContentIndicatorsSectionProps> = ({
  hoveredDate,
  compact = false,
}) => {
  const { data: dataAvailabilityItems } = useGeneralDataAvailabilities();

  // Get content availability for the hovered date
  const contentAvailability = useMemo(() => {
    if (!hoveredDate || !dataAvailabilityItems) return null;
    return dataAvailabilityItems.find((item) => item.date === hoveredDate);
  }, [hoveredDate, dataAvailabilityItems]);

  // Define content types with their availability
  const contentTypes = useMemo(() => {
    const getAvailability = (key: string, availability: DataAvailability) => {
      switch (key) {
        case "blog":
          return availability.blog || availability.actSum;
        case "comm":
          return compact ? availability.comm || availability.vvComm : availability.comm;
        default:
          return availability[key as keyof DataAvailability];
      }
    };

    const baseTypes = [
      { key: "comm", label: "Comm" },
      ...(compact ? [] : [{ key: "vvComm", label: "Comm (Visiting Vehicle)" }]),
      { key: "video", label: "Video" },
      { key: "eva", label: "EVA" },
      { key: "blog", label: "Article" },
      { key: "earthPhotos", label: "Earth Photos" },
      { key: "flickrPhotos", label: "Mission Photos" },
    ];

    return baseTypes.map((type) => ({
      ...type,
      available: contentAvailability ? getAvailability(type.key, contentAvailability) : false,
    }));
  }, [contentAvailability, compact]);

  if (contentTypes.length === 0) {
    return null;
  }

  return (
    <div
      className={styles.contentIndicatorsList}
      data-tooltip-id="source-button-tooltip"
      data-tooltip-content={"This date's available content types"}
      data-tooltip-place="bottom"
    >
      {contentTypes.map((contentType) => (
        <span
          key={contentType.key}
          className={`${styles.contentIndicator} ${
            contentType.available ? styles.available : styles.unavailable
          }`}
        >
          {contentType.label}
        </span>
      ))}
    </div>
  );
};

export default ContentIndicatorsSection;

import React, { FunctionComponent, useMemo } from "react";
import { useGeneralDataAvailabilities } from "api/useGeneralData";
import styles from "./contentIndicatorsSection.module.css";

interface ContentIndicatorsSectionProps {
  hoveredDate: string | null;
}

const ContentIndicatorsSection: FunctionComponent<ContentIndicatorsSectionProps> = ({
  hoveredDate,
}) => {
  const { data: dataAvailabilityItems } = useGeneralDataAvailabilities();

  // Get content availability for the hovered date
  const contentAvailability = useMemo(() => {
    if (!hoveredDate || !dataAvailabilityItems) return null;
    return dataAvailabilityItems.find((item) => item.date === hoveredDate);
  }, [hoveredDate, dataAvailabilityItems]);

  // Define content types with their availability
  const contentTypes = useMemo(() => {
    if (!contentAvailability) return [];

    return [
      {
        key: "comm",
        label: "Comm",
        available: contentAvailability.comm || contentAvailability.vvComm,
      },
      {
        key: "youtube",
        label: "Video",
        available: contentAvailability.youtube,
      },
      {
        key: "eva",
        label: "EVA",
        available: contentAvailability.eva,
      },
      {
        key: "blog",
        label: "Article",
        available: contentAvailability.blog || contentAvailability.activitySummary,
      },
      {
        key: "earthPhotography",
        label: "Earth Photography",
        available: contentAvailability.earthPhotography,
      },
    ];
  }, [contentAvailability]);

  if (contentTypes.length === 0) {
    return null;
  }

  return (
    <div className={styles.contentIndicators}>
      <div className={styles.contentIndicatorsList}>
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
    </div>
  );
};

export default ContentIndicatorsSection;

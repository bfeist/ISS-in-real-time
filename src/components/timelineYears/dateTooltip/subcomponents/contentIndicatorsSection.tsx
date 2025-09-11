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

  const getAvailability = (key: string, availability: DataAvailability) => {
    switch (key) {
      case "blog":
        return availability.blog || availability.actSum;
      case "photo":
        return availability.earthPhotos || availability.photos;
      default:
        return availability[key as keyof DataAvailability];
    }
  };

  // Define content types with their availability
  const contentTypes = useMemo(() => {
    const baseTypes = [
      { key: "comm", label: "Comm" },
      { key: "vvComm", label: "Comm (Visiting Vehicle)" },
      { key: "video", label: "Video" },
      { key: "eva", label: "EVA" },
      { key: "blog", label: "Article" },
      { key: "photo", label: "Photos" },
    ];

    return baseTypes.map((type) => ({
      ...type,
      available: contentAvailability ? getAvailability(type.key, contentAvailability) : false,
    }));
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

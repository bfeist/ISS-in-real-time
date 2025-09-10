import React, { FunctionComponent, useMemo } from "react";
import { useCommFirstData } from "api/useGeneralData";
import { extractChannelInfoFromFilename, extractTimeFromFilename } from "utils/comm";
import TypingText from "../../../common/typingText/typingText";
import styles from "./firstCommSection.module.css";

// Explicitly reference dynamic CSS classes to prevent linter warnings
// @ts-ignore - Used to prevent unused CSS class warnings
const _unusedClasses = [
  styles.channel1,
  styles.channel2,
  styles.channel3,
  styles.channel4,
  styles.channel5,
];

interface FirstCommSectionProps {
  hoveredDate: string | null;
  hasCommData: boolean;
}

const FirstCommSection: FunctionComponent<FirstCommSectionProps> = ({
  hoveredDate,
  hasCommData,
}) => {
  const { data: commFirstData } = useCommFirstData();

  const firstCommItem = hoveredDate && commFirstData ? commFirstData[hoveredDate] : null;

  // Get first few communication items for preview (limit to 3-5 items)
  const previewCommItems = useMemo(() => {
    return firstCommItem ? [firstCommItem] : [];
  }, [firstCommItem]);

  if (!hasCommData || previewCommItems.length === 0) {
    return null;
  }

  return (
    <div className={styles.commPreview}>
      <div className={styles.commPreviewHeader}>First Communication</div>
      <div className={styles.commPreviewItems}>
        {previewCommItems.map((item: CommFirstItem, index: number) => {
          const channelInfo = extractChannelInfoFromFilename(item.filename);
          const timeFromFilename = extractTimeFromFilename(item.filename);

          return (
            <div key={`${item.filename}-${index}`} className={styles.commPreviewItem}>
              {timeFromFilename && <div className={styles.commPreviewTime}>{timeFromFilename}</div>}
              {channelInfo && (
                <div
                  className={`${styles.commPreviewChannel} ${
                    styles[`channel${channelInfo.number}`]
                  }`}
                >
                  {channelInfo.type}-{channelInfo.number}
                </div>
              )}
              <div className={styles.commPreviewText}>
                <div>
                  <TypingText text={item.text} speed={25} delay={200} cursor />
                </div>
                {item.textOriginalLang && (
                  <div className={styles.commPreviewOriginalLang}>
                    <TypingText
                      text={item.textOriginalLang}
                      speed={20}
                      delay={1000}
                      cursor={false}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FirstCommSection;

export function processCommCsv(data: string): CommItem[] {
  // lines are "|" delimited
  const lines = data.split("\n");
  const commItems: CommItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fields = line.trim().split("|");
    if (fields.length === 7) {
      const [utteranceTime, filename, start, end, language, text, textOriginalLang] = fields;
      commItems.push({
        utteranceTime,
        filename,
        start,
        end,
        language,
        text,
        textOriginalLang,
      });
    } else {
      if (fields.length > 1)
        console.error(`Unexpected number of fields in comm csv on line ${i}: ${fields.length}`);
    }
  }
  return commItems;
}

/**
 * Extracts channel type (SG, DG, or AG) and number from filename
 * @param filename The filename to extract from
 * @returns Object containing channel type and number, or null if not found
 */
export const extractChannelInfoFromFilename = (
  filename: string
): { type: "SG" | "DG" | "AG"; number: string } | null => {
  const regex = /_(SG|DG|AG)_(\d+)/;
  const match = filename.match(regex);
  if (match) {
    return {
      type: match[1] as "SG" | "DG" | "AG",
      number: match[2],
    };
  }
  return null;
};

/**
 * Extracts time from filename in format 2015-05-12T135230-1_SG_1_IA.aac
 * @param filename The filename to extract time from
 * @returns Formatted time string (HH:MM:SS) or null if not found
 */
export const extractTimeFromFilename = (filename: string): string | null => {
  const regex = /T(\d{6})/;
  const match = filename.match(regex);
  if (match) {
    const timeStr = match[1]; // hhmmss
    const hours = timeStr.substring(0, 2);
    const minutes = timeStr.substring(2, 4);
    const seconds = timeStr.substring(4, 6);
    return `${hours}:${minutes}:${seconds}`;
  }
  return null;
};

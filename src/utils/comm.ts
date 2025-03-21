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

export function processTranscriptCsv(data: string): TranscriptItem[] {
  // lines are "|" delimited
  const lines = data.split("\n");
  const transcriptItems: TranscriptItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fields = line.split("|");
    if (fields.length === 7) {
      const [utteranceTime, filename, start, end, language, text, textOriginalLang] = fields;
      transcriptItems.push({
        utteranceTime,
        filename,
        start,
        end,
        language,
        text,
        textOriginalLang,
      });
    } else {
      console.error(`Unexpected number of fields in transcript csv on line ${i}: ${fields.length}`);
    }
  }
  return transcriptItems;
}

export const extractChannelnumFromFilename = (filename: string): string | null => {
  const regex = /_SG_(\d+)/; // Matches _SG followed by one or more digits and underscores
  const match = filename.match(regex);
  if (match) {
    return match[1];
  }
  return null; // Return null if no match is found
};

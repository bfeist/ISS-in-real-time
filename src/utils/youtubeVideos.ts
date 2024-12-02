export function processYoutubeVideosCsv(data: string): YoutubeVideoItem[] {
  // lines are "|" delimited
  const lines = data.split("\n");
  const items: YoutubeVideoItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fields = line.split("|");
    if (fields.length === 4) {
      const [startTime, videoId, duration, title] = fields;
      items.push({
        startTime,
        videoId,
        duration: parseInt(duration),
        title,
      });
    } else {
      console.error(`Unexpected number of fields in yoututbe csv on line ${i}: ${fields.length}`);
    }
  }
  return items;
}

export const extractChannelnumFromFilename = (filename: string): string | null => {
  const regex = /_SG_(\d+)/; // Matches _SG followed by one or more digits and underscores
  const match = filename.match(regex);
  if (match) {
    return match[1];
  }
  return null; // Return null if no match is found
};

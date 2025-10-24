export const extractChannelnumFromFilename = (filename: string): string | null => {
  const regex = /_SG_(\d+)/; // Matches _SG followed by one or more digits and underscores
  const match = filename.match(regex);
  if (match) {
    return match[1];
  }
  return null; // Return null if no match is found
};

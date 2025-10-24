// Helper function to capitalize the first letter of each word
export const capitalizeWords = (str: string): string => {
  return str
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const isValidTimestring = (t: string): boolean => {
  if (!t) return false;

  const timeParts = t.split(":");
  if (timeParts.length !== 3) return false;
  const hours = parseInt(timeParts[0]);
  const minutes = parseInt(timeParts[1]);
  const seconds = parseInt(timeParts[2]);

  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return false;
  if (hours < 0 || hours > 23) return false;
  if (minutes < 0 || minutes > 59) return false;
  if (seconds < 0 || seconds > 59) return false;

  return true;
};

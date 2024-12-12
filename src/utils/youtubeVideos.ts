export const extractChannelnumFromFilename = (filename: string): string | null => {
  const regex = /_SG_(\d+)/; // Matches _SG followed by one or more digits and underscores
  const match = filename.match(regex);
  if (match) {
    return match[1];
  }
  return null; // Return null if no match is found
};

export const youtubeApplyManualStartTimes = ({
  youtubeLiveRecordings,
  youtubeManualStartTimes,
}: {
  youtubeLiveRecordings: YoutubeLiveRecording[];
  youtubeManualStartTimes: YoutubeManualStartTime[];
}): YoutubeLiveRecording[] => {
  return youtubeLiveRecordings.map((recording) => {
    const manualStartTime = youtubeManualStartTimes.find(
      (manualStartTime) => manualStartTime.videoId === recording.videoId
    );
    if (manualStartTime) {
      // calculate the manual start time by subtracting youtubeTime from youtubeTimeIsoTimestamp
      const youtubeTime = manualStartTime.youtubeTime.split(":");
      const youtubeTimeSeconds =
        parseInt(youtubeTime[0]) * 3600 + parseInt(youtubeTime[1]) * 60 + parseInt(youtubeTime[2]);
      const youtubeTimeIsoTimestamp = new Date(manualStartTime.youtubeTimeIsoTimestamp);
      const newStartTime = new Date(youtubeTimeIsoTimestamp.getTime() - youtubeTimeSeconds * 1000);
      const startTime = newStartTime.toISOString().split(".")[0] + "Z";

      // log how many seconds the manual start time is different from the original start time
      const timeDiff = new Date(recording.startTime).getTime() - newStartTime.getTime();
      console.log(
        `Manual start time for video ${recording.videoId} is ${timeDiff / 1000} seconds different from the original start time`
      );

      return {
        ...recording,
        startTime,
      };
    }
    return recording;
  });
};

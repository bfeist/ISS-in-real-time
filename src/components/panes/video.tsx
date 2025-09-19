import { FunctionComponent } from "react";
import { useStateClock } from "store/hooks/useStateClock";
import { useGeneralVideoYt, useGeneralVideoIa } from "api/useGeneralData";
import YtVideoComponent from "./videoYt";
import VideoIaComponent from "./videoIa";

const VideoComponent: FunctionComponent = () => {
  const { selectedDate } = useStateClock();

  const { data: videoYt = [], isLoading: isloadingYt } = useGeneralVideoYt();
  const { data: videoIa = [], isLoading: isloadingIa } = useGeneralVideoIa();

  const isLoading = isloadingYt || isloadingIa;

  const videoYtRecording = videoYt?.find(
    (recording: VideoYtItem) =>
      recording?.ytStartTime.startsWith(selectedDate || "") && recording.duration > 0
  );

  const videoIaRecordings = videoIa?.filter(
    (recording: VideoIaItem) => recording?.date === selectedDate
  );

  if (isLoading) {
    return <div>Loading video data...</div>;
  }

  // Prefer YouTube if available, otherwise use IA video
  if (videoYtRecording) {
    return (
      <YtVideoComponent videoId={videoYtRecording.videoId} videoYtRecording={videoYtRecording} />
    );
  }

  if (videoIaRecordings && videoIaRecordings.length > 0) {
    return <VideoIaComponent videoIaRecordings={videoIaRecordings} />;
  }

  return <div>No video available for this date</div>;
};

export default VideoComponent;

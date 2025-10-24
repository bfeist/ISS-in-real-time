import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../index";

export const useStateToggle = (): {
  commMute: boolean;
  setCommMute: (mute: boolean) => void;
  videoMute: boolean;
  setVideoMute: (mute: boolean) => void;
  showGlobe: boolean;
  setShowGlobe: (show: boolean) => void;
  showTimelineYears: boolean;
  setShowTimelineYears: (show: boolean) => void;
  hoveringYearsLabels: boolean;
  setHoveringYearsLabels: (hovering: boolean) => void;
  showEarthPhotos: boolean;
  setShowEarthPhotos: (show: boolean) => void;
  showMissionPhotos: boolean;
  setShowMissionPhotos: (show: boolean) => void;
  showTimelapsePhotos: boolean;
  setShowTimelapsePhotos: (show: boolean) => void;
} =>
  useAppStore(
    useShallow((state) => ({
      commMute: state.commMute,
      setCommMute: state.setCommMute,
      videoMute: state.videoMute,
      setVideoMute: state.setVideoMute,
      showGlobe: state.showGlobe,
      setShowGlobe: state.setShowGlobe,
      showTimelineYears: state.showTimelineYears,
      setShowTimelineYears: state.setShowTimelineYears,
      hoveringYearsLabels: state.hoveringYearsLabels,
      setHoveringYearsLabels: state.setHoveringYearsLabels,
      showEarthPhotos: state.showEarthPhotos,
      setShowEarthPhotos: state.setShowEarthPhotos,
      showMissionPhotos: state.showMissionPhotos,
      setShowMissionPhotos: state.setShowMissionPhotos,
      showTimelapsePhotos: state.showTimelapsePhotos,
      setShowTimelapsePhotos: state.setShowTimelapsePhotos,
    }))
  );

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../index";
import { useShallow } from "zustand/react/shallow";
import { createDateTimeSlug } from "../../utils/params";
import { timeStrFromAppSeconds } from "../../utils/time";

export const useDateTimeNavigation = (): {
  navigateToDateTime: (date: string, timeSeconds: number) => void;
  navigateToCurrentDateTime: () => void;
  setDateTimeAndNavigate: (date: string, timeSeconds: number) => void;
  getCurrentSlug: () => string | null;
  getCurrentAppSeconds: () => number;
} => {
  const navigate = useNavigate();

  const {
    selectedDate,
    appSecondsAtStartStop,
    isRunning,
    startStopTimestamp,
    setSelectedDate,
    setClock,
  } = useAppStore(
    useShallow((state) => ({
      selectedDate: state.selectedDate,
      appSecondsAtStartStop: state.appSecondsAtStartStop,
      isRunning: state.isRunning,
      startStopTimestamp: state.startStopTimestamp,
      setSelectedDate: state.setSelectedDate,
      setClock: state.setClock,
    }))
  );

  const getCurrentAppSeconds = useCallback(() => {
    if (isRunning) {
      return Math.floor(
        appSecondsAtStartStop + (Date.now() - Date.parse(startStopTimestamp)) / 1000
      );
    }
    return appSecondsAtStartStop;
  }, [appSecondsAtStartStop, isRunning, startStopTimestamp]);

  const navigateToDateTime = useCallback(
    (date: string, timeSeconds: number) => {
      const timeStr = timeStrFromAppSeconds(timeSeconds);
      const slug = createDateTimeSlug(date, timeStr);
      navigate(`/${slug}`);
    },
    [navigate]
  );

  const navigateToCurrentDateTime = useCallback(() => {
    if (!selectedDate) return;
    const currentSeconds = getCurrentAppSeconds();
    navigateToDateTime(selectedDate, currentSeconds);
  }, [selectedDate, getCurrentAppSeconds, navigateToDateTime]);

  const setDateTimeAndNavigate = useCallback(
    (date: string, timeSeconds: number) => {
      setSelectedDate(date);
      setClock(timeSeconds);
      navigateToDateTime(date, timeSeconds);
    },
    [setSelectedDate, setClock, navigateToDateTime]
  );

  const getCurrentSlug = useCallback(() => {
    if (!selectedDate) return null;
    const currentSeconds = getCurrentAppSeconds();
    const timeStr = timeStrFromAppSeconds(currentSeconds);
    return createDateTimeSlug(selectedDate, timeStr);
  }, [selectedDate, getCurrentAppSeconds]);

  return {
    navigateToDateTime,
    navigateToCurrentDateTime,
    setDateTimeAndNavigate,
    getCurrentSlug,
    getCurrentAppSeconds,
  };
};

import { useStateClock } from "store/hooks/useStateClock";
import { FunctionComponent, useEffect, useRef } from "react";

/**
 * This component is responsible for updating the parent's appSeconds based on the clock's state.
 */
const ClockInterval: FunctionComponent<{
  setAppSeconds: Function;
}> = ({ setAppSeconds }) => {
  const { appSecondsAtStartStop, isRunning, startStopTimestamp } = useStateClock();

  const intervalRef = useRef(null);

  useEffect(() => {
    if (isRunning) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          const secondsSinceStarted = (Date.now() - Date.parse(startStopTimestamp)) / 1000;
          const newAppSeconds = Math.floor(appSecondsAtStartStop + secondsSinceStarted);
          // Cap at 86401 to prevent race conditions while allowing day rollover at 86400
          setAppSeconds(Math.min(newAppSeconds, 86401));
        }, 100);
      }
    } else {
      const secondsSinceStarted = (Date.now() - Date.parse(startStopTimestamp)) / 1000;
      const newAppSeconds = Math.floor(appSecondsAtStartStop + secondsSinceStarted);
      // Cap at 86401 to prevent race conditions while allowing day rollover at 86400
      setAppSeconds(Math.min(newAppSeconds, 86401));

      clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    return () => {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [intervalRef, appSecondsAtStartStop, isRunning, startStopTimestamp, setAppSeconds]);

  return <></>;
};

export default ClockInterval;

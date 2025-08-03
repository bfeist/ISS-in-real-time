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
          setAppSeconds(newAppSeconds);
        }, 100);
      }
    } else {
      const secondsSinceStarted = (Date.now() - Date.parse(startStopTimestamp)) / 1000;
      const newAppSeconds = Math.floor(appSecondsAtStartStop + secondsSinceStarted);
      setAppSeconds(newAppSeconds);

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

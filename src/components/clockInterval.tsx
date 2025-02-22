import { useClockContext } from "context/clockContext";
import { FunctionComponent, useEffect, useRef } from "react";

/**
 * This component is responsible for updating the parent's appSeconds based on the clock's state.
 */
const ClockInterval: FunctionComponent<{
  setAppSeconds: Function;
}> = ({ setAppSeconds }) => {
  const { clock } = useClockContext();

  const intervalRef = useRef(null);

  useEffect(() => {
    if (clock.isRunning) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          const secondsSinceStarted = (Date.now() - Date.parse(clock.startStopTimestamp)) / 1000;
          const newAppSeconds = Math.floor(clock.appSecondsAtStartStop + secondsSinceStarted);
          setAppSeconds(newAppSeconds);
        }, 100);
      }
    } else {
      const secondsSinceStarted = (Date.now() - Date.parse(clock.startStopTimestamp)) / 1000;
      const newAppSeconds = Math.floor(clock.appSecondsAtStartStop + secondsSinceStarted);
      setAppSeconds(newAppSeconds);

      clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    return () => {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalRef, clock]);

  return <></>;
};

export default ClockInterval;

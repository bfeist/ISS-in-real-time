import { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";

const HINT_DELAY_MS = 4000;

type MouseHintController = {
  showHint: boolean;
  markInteracted: () => void;
  hasInteracted: boolean;
};

const clearHintTimer = (timerRef: MutableRefObject<NodeJS.Timeout | null>) => {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
};

export const useMouseHint = (isTimelineVisible: boolean): MouseHintController => {
  const [showHint, setShowHint] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasInteractedRef = useRef(false);

  const markInteracted = useCallback(() => {
    hasInteractedRef.current = true;
    clearHintTimer(timerRef);
    setShowHint(false);
  }, []);

  useEffect(() => {
    clearHintTimer(timerRef);

    if (!isTimelineVisible) {
      setShowHint(false);
      return () => {
        clearHintTimer(timerRef);
      };
    }

    if (hasInteractedRef.current) {
      setShowHint(false);
      return () => {
        clearHintTimer(timerRef);
      };
    }

    timerRef.current = setTimeout(() => {
      setShowHint(true);
    }, HINT_DELAY_MS);

    return () => {
      clearHintTimer(timerRef);
    };
  }, [isTimelineVisible]);

  return {
    showHint,
    markInteracted,
    hasInteracted: hasInteractedRef.current,
  };
};

export { HINT_DELAY_MS };

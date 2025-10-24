import React, { useState, useEffect, useRef } from "react";
import styles from "./typingText.module.css";

interface TypingTextProps {
  text: string;
  speed?: number; // Characters per second
  delay?: number; // Initial delay before typing starts (in ms)
  className?: string;
  onComplete?: () => void;
  cursor?: boolean; // Whether to show a typing cursor
  preserveSpaces?: boolean; // Whether to preserve leading/trailing spaces
}

const TypingText: React.FC<TypingTextProps> = ({
  text,
  speed = 30, // Default 30 characters per second
  delay = 0,
  className = "",
  onComplete,
  cursor = true,
  preserveSpaces = true,
}) => {
  const [displayedText, setDisplayedText] = useState("");
  const [showCursor, setShowCursor] = useState(cursor);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentIndexRef = useRef(0);

  const startTyping = React.useCallback(() => {
    const textToType = preserveSpaces ? text : text.trim();
    const intervalTime = 1000 / speed; // Convert speed to interval

    intervalRef.current = setInterval(() => {
      if (currentIndexRef.current <= textToType.length) {
        setDisplayedText(textToType.slice(0, currentIndexRef.current));
        currentIndexRef.current++;
      } else {
        // Typing complete
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        // Hide cursor after typing is complete
        if (cursor) {
          setTimeout(() => {
            setShowCursor(false);
          }, 500);
        }

        if (onComplete) {
          onComplete();
        }
      }
    }, intervalTime);
  }, [text, speed, preserveSpaces, cursor, onComplete]);

  useEffect(() => {
    // Reset state when text changes
    setDisplayedText("");
    setShowCursor(cursor);
    currentIndexRef.current = 0;

    // Clear any existing timers
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!text) {
      return;
    }

    // Start typing after delay
    timeoutRef.current = setTimeout(() => {
      startTyping();
    }, delay);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [text, speed, delay, cursor, startTyping]);

  return (
    <span className={`${styles.typingText} ${className}`}>
      {displayedText}
      {showCursor && <span className={styles.cursor} />}
    </span>
  );
};

export default TypingText;

import { FunctionComponent, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { faBook } from "@fortawesome/free-solid-svg-icons";
import styles from "./about.module.css";
import IconButton from "../common/iconButton";
import CloseButton from "../common/closeButton";

const AboutModal: FunctionComponent<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.modal} ref={modalRef}>
        <div className={styles.header}>
          <h3>About This Project</h3>
          <CloseButton
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
        </div>
        <div className={styles.content}>
          <p>
            ISS in real time is an interactive experience that lets you explore the past 25 years
            onboard the International Space Station.
          </p>
          <p>
            All data here is original historical mission material sourced from across the internet.
            We have placed it into context so you can experience each day as it happened.
          </p>
          <p>
            Sourcing and processing the data was a challenge. We found it in many different places
            and formats including public sources such as{" "}
            <a href="https://nasa.gov" target="_blank" rel="noopener noreferrer">
              nasa.gov
            </a>
            ,{" "}
            <a href="https://archive.org" target="_blank" rel="noopener noreferrer">
              archive.org
            </a>
            , youtube, and flickr.
          </p>
          <p>
            Comm transcription and image classification were achieved using AI processing on a
            massive scale. There may be some errors in the data, but we did our best to ensure
            accuracy.
          </p>
          <IconButton
            icon={faBook}
            label="Read More About the Making of This Project"
            className={styles.readMore}
            onClick={() => {
              window.open(
                "https://benfeist.com/posts/iss-in-real-time/",
                "_blank",
                "noopener,noreferrer"
              );
            }}
          />

          <h4>Who Made This?</h4>
          <a href="/images/daveandben.jpg" target="_blank" rel="noopener noreferrer">
            <img
              src="/images/daveandben.jpg"
              alt="Dave and Ben"
              style={{ float: "right", width: "180px", marginLeft: "10px" }}
            />
          </a>
          <p>
            ISS in Real Time was built by{" "}
            <a href="https://benfeist.com" target="_blank" rel="noopener noreferrer">
              Ben Feist
            </a>{" "}
            and{" "}
            <a href="https://davidcharney.com" target="_blank" rel="noopener noreferrer">
              David Charney
            </a>
            . We are both contractors at NASA, but we did this on evenings and weekends, just
            because we like to put good things on the Internet.
          </p>

          <p>
            Nov 2, 2025 marks the 25th anniversary of continuous human presence in space. We thought
            it would be cool to show the world each and every day onboard.
          </p>

          <p>
            A few years ago, we also made{" "}
            <a href="https://apolloinrealtime.org" target="_blank" rel="noopener noreferrer">
              Apollo in Real Time
            </a>
            . We consider ISS in Real Time a continuation of that work. Don&apos;t worry, we
            haven&apos;t forgotten about the remaining Apollo missions. Stay tuned.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AboutModal;

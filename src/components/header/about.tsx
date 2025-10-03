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
            It was already public, just not assembled in this way.
          </p>

          <h4>Who Made This?</h4>

          <p>
            This website was built by{" "}
            <a href="https://benfeist.com" target="_blank" rel="noopener noreferrer">
              Ben Feist
            </a>{" "}
            and{" "}
            <a href="https://davidcharney.com" target="_blank" rel="noopener noreferrer">
              David Charney
            </a>{" "}
            . We built ISS in real time over the past year, on evenings and weekends, just because
            we like to put good things on the Internet.
          </p>

          <p>
            Nov 2, 2000 marked the beginning of continuous human presence in space. We thought it
            would be cool to show the world each and every day onboard.
          </p>

          <p>
            We also made{" "}
            <a href="https://apolloinrealtime.org" target="_blank" rel="noopener noreferrer">
              Apollo in Real Time
            </a>
            , which is a similar concept. Don&apos;t worry, we haven&apos;t forgotten about the
            remaining Apollo missions. Stay tuned.
          </p>
        </div>
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
      </div>
    </div>,
    document.body
  );
};

export default AboutModal;

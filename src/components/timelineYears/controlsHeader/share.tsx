import { FunctionComponent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { faShare } from "@fortawesome/free-solid-svg-icons";
import styles from "./share.module.css";
import { generateShareUrl } from "utils/params";
import IconButton from "../../common/iconButton";
const ShareModal: FunctionComponent<{
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  hasSelectedDate: boolean;
}> = ({ isOpen, onClose, shareUrl, hasSelectedDate }) => {
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

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      onClose();
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.modal} ref={modalRef}>
        <div className={styles.header}>
          <h3>Share Current View</h3>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.content}>
          <p>{hasSelectedDate ? "Share this exact time on the ISS:" : "Share ISS in Real Time"}</p>
          <div className={styles.urlContainer}>
            <input
              type="text"
              value={shareUrl}
              readOnly
              className={styles.urlInput}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          </div>
          <button className={styles.copyButton} onClick={handleCopyToClipboard}>
            Copy to Clipboard
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

interface ShareButtonProps {
  selectedDate: string | null;
  appSeconds: number;
}

const ShareButton: FunctionComponent<ShareButtonProps> = ({ selectedDate, appSeconds }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <IconButton
        icon={faShare}
        onClick={() => setIsModalOpen(true)}
        aria-label="Share current view"
      />
      <ShareModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        shareUrl={generateShareUrl(selectedDate, appSeconds)}
        hasSelectedDate={!!selectedDate}
      />
    </>
  );
};

export default ShareButton;

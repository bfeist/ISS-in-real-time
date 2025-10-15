import { FunctionComponent, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import styles from "./noDataWarning.module.css";
import CloseButton from "../common/closeButton";
import { useGeneralDataAvailabilities } from "api/useGeneralData";
import { getLastDateWithData } from "utils/dateTime";

interface NoDataWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NoDataWarningModal: FunctionComponent<NoDataWarningModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const { data: dataAvailabilities, isLoading } = useGeneralDataAvailabilities();

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

  const lastDateWithData = useMemo(
    () => getLastDateWithData(dataAvailabilities),
    [dataAvailabilities]
  );

  const formattedLastDate = useMemo(() => {
    if (!lastDateWithData) {
      return null;
    }

    const date = dayjs(lastDateWithData);
    if (!date.isValid()) {
      return null;
    }

    return date.format("MMMM D, YYYY");
  }, [lastDateWithData]);

  if (!isOpen) {
    return null;
  }

  if (formattedLastDate === null && !isLoading) {
    // If we don't have a last date with data and we're not loading, don't show the modal
    return null;
  }

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.modal} ref={modalRef} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h3>Data Status</h3>
          <CloseButton
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          />
        </div>
        <div className={styles.content}>
          {isLoading && <div className={styles.loading}>Checking the latest mission data…</div>}

          {!isLoading && (
            <>
              <p>
                Mission data is currently available up to <strong>{formattedLastDate}</strong>.
              </p>
              <p>
                NASA releases ISS mission data in batches on a regular basis. We manually check for
                new data and update ISS in Real Time at regular intervals. Please check back soon
                for updates.
              </p>
              <p>Thank you for your patience and understanding 🚀</p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NoDataWarningModal;

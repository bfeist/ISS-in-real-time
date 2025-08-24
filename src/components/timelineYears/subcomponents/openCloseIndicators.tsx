import { FunctionComponent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretUp, faCaretDown } from "@fortawesome/free-solid-svg-icons";
import styles from "./openCloseIndicators.module.css";

interface OpenCloseIndicatorsProps {
  isOpen: boolean;
  onToggle: () => void;
}

const OpenCloseIndicators: FunctionComponent<OpenCloseIndicatorsProps> = ({ isOpen, onToggle }) => {
  const icon = isOpen ? faCaretUp : faCaretDown;
  const text = isOpen ? "CLOSE TIMELINE" : "OPEN TIMELINE";
  const positionClass = isOpen ? styles.indicatorClosed : styles.indicatorOpen;
  const ariaLabel = isOpen ? "Close timeline" : "Open timeline";

  return (
    <div
      className={`${styles.indicator} ${positionClass}`}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onToggle();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
    >
      <FontAwesomeIcon icon={icon} className={styles.indicatorIcon} />
      <span>{text}</span>
      <FontAwesomeIcon icon={icon} className={styles.indicatorIcon} />
    </div>
  );
};

export default OpenCloseIndicators;

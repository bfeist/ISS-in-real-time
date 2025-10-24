import { FunctionComponent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronUp, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import styles from "./toggleCalendarButton.module.css";
import { useStateToggle } from "store/hooks/useStateToggle";

const ToggleCalendarButton: FunctionComponent = () => {
  const { showTimelineYears, setShowTimelineYears } = useStateToggle();

  return (
    <button
      className={styles.toggleCalendarButton}
      onClick={() => setShowTimelineYears(!showTimelineYears)}
    >
      <FontAwesomeIcon icon={showTimelineYears ? faChevronUp : faChevronDown} />
      {showTimelineYears ? "Close Calendar" : "Open Calendar"}
      <FontAwesomeIcon icon={showTimelineYears ? faChevronUp : faChevronDown} />
    </button>
  );
};

export default ToggleCalendarButton;

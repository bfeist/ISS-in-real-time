import { FunctionComponent } from "react";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import IconButton from "./iconButton";
import styles from "./closeButton.module.css";

interface CloseButtonProps {
  onClick: (e: React.MouseEvent) => void;
  className?: string;
  ariaLabel?: string;
}

const CloseButton: FunctionComponent<CloseButtonProps> = ({
  onClick,
  className = "",
  ariaLabel = "Close modal",
}) => {
  return (
    <IconButton
      icon={faTimes}
      onClick={onClick}
      className={`${styles.closeButton} ${className}`}
      aria-label={ariaLabel}
    />
  );
};

export default CloseButton;

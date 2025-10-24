import { FunctionComponent } from "react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./iconButton.module.css";

interface IconButtonProps {
  icon: IconDefinition;
  iconRight?: boolean;
  label?: string;
  style?: React.CSSProperties;
  flash?: boolean;
  selected?: boolean;
  enabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  tooltipContent?: string;
  tooltipPlace?: "top" | "right" | "bottom" | "left";
}

const IconButton: FunctionComponent<IconButtonProps> = ({
  icon,
  iconRight = false,
  label,
  className,
  style,
  flash = false,
  selected = false,
  enabled = true,
  onClick,
  tooltipContent,
  tooltipPlace = "top",
}) => {
  const buttonClasses = [
    styles.iconButton,
    flash && styles.flash,
    selected && styles.selected,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const buttonStyle = {
    ...style,
  };

  return (
    <button
      className={buttonClasses}
      style={buttonStyle}
      aria-label={label}
      disabled={!enabled}
      onClick={onClick}
      data-tooltip-id={tooltipContent ? "issirt-tooltip" : undefined}
      data-tooltip-content={tooltipContent}
      data-tooltip-place={tooltipPlace}
    >
      {iconRight ? (
        <>
          {label && <span className={styles.label}>{label}</span>}
          <FontAwesomeIcon icon={icon} className={styles.icon} />
        </>
      ) : (
        <>
          <FontAwesomeIcon icon={icon} className={styles.icon} />
          {label && <span className={styles.label}>{label}</span>}
        </>
      )}
    </button>
  );
};

export default IconButton;

import { FunctionComponent, ButtonHTMLAttributes } from "react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./iconButton.module.css";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconDefinition;
  label?: string;
  style?: React.CSSProperties;
  flash?: boolean;
}

const IconButton: FunctionComponent<IconButtonProps> = ({
  icon,
  label,
  className,
  style,
  flash = false,
  ...props
}) => {
  const buttonClasses = [styles.iconButton, flash && styles.flash, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={buttonClasses} style={style} aria-label={label} {...props}>
      <FontAwesomeIcon icon={icon} className={styles.icon} />
      {label && <span className={styles.label}>{label}</span>}
    </button>
  );
};

export default IconButton;

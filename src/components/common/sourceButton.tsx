import { FunctionComponent } from "react";
import styles from "./sourceButton.module.css";

interface SourceButtonProps {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  variant?: "withText" | "iconOnly";
  children: React.ReactNode;
  tooltip?: string;
}

const SourceButton: FunctionComponent<SourceButtonProps> = ({
  onClick,
  ariaLabel = "View source",
  variant = "iconOnly",
  children,
  tooltip = "View source",
}) => {
  const className = `${styles.sourceButton} ${
    variant === "withText" ? styles.withText : styles.iconOnly
  }`;

  return (
    <button
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
      data-tooltip-id={tooltip ? "source-button-tooltip" : undefined}
      data-tooltip-content={tooltip}
      data-tooltip-place="left"
    >
      {children}
    </button>
  );
};

export default SourceButton;

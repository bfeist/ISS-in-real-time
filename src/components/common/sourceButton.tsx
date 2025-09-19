import { FunctionComponent } from "react";
import styles from "./sourceButton.module.css";

interface SourceButtonProps {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  variant?: "withText" | "iconOnly";
  children: React.ReactNode;
}

const SourceButton: FunctionComponent<SourceButtonProps> = ({
  onClick,
  ariaLabel = "View source",
  variant = "iconOnly",
  children,
}) => {
  const className = `${styles.sourceButton} ${
    variant === "withText" ? styles.withText : styles.iconOnly
  }`;

  return (
    <button className={className} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
};

export default SourceButton;

import { memo } from "react";
import type { Connective } from "./types";

interface ConnectiveToggleProps {
  value: Connective;
  onChange: (value: Connective) => void;
  size?: "sm" | "md";
}

export const ConnectiveToggle = memo(function ConnectiveToggle({
  value,
  onChange,
  size = "md",
}: ConnectiveToggleProps) {
  const isAnd = value === "∧";

  const sizeClasses = {
    sm: {
      container: "h-7 w-20",
      button: "flex-1 text-xs font-medium",
      text: "text-xs",
    },
    md: {
      container: "h-8 w-24",
      button: "flex-1 text-sm font-medium",
      text: "text-sm",
    },
  };

  const classes = sizeClasses[size];

  return (
    <div
      className={`
        relative flex bg-gray-100 rounded-md ${classes.container}
        overflow-hidden
      `}
    >
      <div
        className={`
          absolute top-0 bottom-0 w-1/2 rounded-sm transition-all duration-200 ease-out
          bg-gray-700
          ${isAnd ? "left-0" : "left-1/2"}
        `}
      />

      <button
        onClick={() => onChange("∧")}
        className={`
          relative z-10 ${classes.button} rounded-l-sm transition-colors duration-150
          flex items-center justify-center
          ${isAnd ? "text-white" : "text-gray-500 hover:text-gray-700"}
        `}
      >
        <span className={classes.text}>AND</span>
      </button>

      <button
        onClick={() => onChange("∨")}
        className={`
          relative z-10 ${classes.button} rounded-r-sm transition-colors duration-150
          flex items-center justify-center
          ${!isAnd ? "text-white" : "text-gray-500 hover:text-gray-700"}
        `}
      >
        <span className={classes.text}>OR</span>
      </button>
    </div>
  );
});

export default ConnectiveToggle;

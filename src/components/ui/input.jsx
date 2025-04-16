import * as React from "react"
import { cn } from "../../lib/utils"
import PropTypes from 'prop-types'

const Input = React.forwardRef(
  (
    {
      type = "text",
      variant = "default",
      size = "md",
      error = false,
      success = false,
      leftIcon,
      rightIcon,
      className,
      inputClassName,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "flex rounded-md border px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
    const variantStyles = {
      default: "bg-background border-input",
      outline: "bg-background border-2 border-primary",
      filled: "bg-muted border-transparent",
      unstyled: "border-none bg-transparent shadow-none",
    };
    const sizeStyles = {
      sm: "h-7 text-xs",
      md: "h-9 text-sm",
      lg: "h-12 text-base",
    };
    const stateStyles = error
      ? "border-red-500 focus-visible:ring-red-500"
      : success
      ? "border-green-500 focus-visible:ring-green-500"
      : "";

    // Hide number input spinners and set compact width
    const numberInputClass =
      type === "number"
        ? "w-16 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none appearance-none"
        : "";

    return (
      <div className={cn("relative flex items-center", className)}>
        {leftIcon && <span className="absolute left-2">{leftIcon}</span>}
        <input
          ref={ref}
          type={type}
          className={cn(
            baseStyles,
            variantStyles[variant],
            sizeStyles[size],
            stateStyles,
            leftIcon && "pl-8",
            rightIcon && "pr-8",
            numberInputClass,
            inputClassName
          )}
          {...props}
        />
        {rightIcon && <span className="absolute right-2">{rightIcon}</span>}
      </div>
    );
  }
);

Input.displayName = "Input";
Input.propTypes = {
  type: PropTypes.string,
  variant: PropTypes.oneOf(["default", "outline", "filled", "unstyled"]),
  size: PropTypes.oneOf(["sm", "md", "lg"]),
  error: PropTypes.bool,
  success: PropTypes.bool,
  leftIcon: PropTypes.node,
  rightIcon: PropTypes.node,
  className: PropTypes.string,
  inputClassName: PropTypes.string,
};

export { Input }

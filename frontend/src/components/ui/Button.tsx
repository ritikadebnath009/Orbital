import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const sizes = {
  sm: "px-3 py-1.5 text-sm rounded-xl",
  md: "px-4 py-2 text-sm rounded-xl",
  lg: "px-6 py-3.5 text-[15px] rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const variantClass =
      variant === "primary"
        ? "btn-primary"
        : variant === "secondary"
        ? "btn-secondary"
        : variant === "danger"
        ? "bg-[#ff5c7a]/20 hover:bg-[#ff5c7a]/30 text-[#ff5c7a] border border-[#ff5c7a]/30"
        : "hover:bg-white/5 text-white/60 hover:text-white";

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-semibold",
          "transition-all duration-200 focus:outline-none",
          "disabled:cursor-not-allowed select-none",
          variantClass,
          sizes[size],
          className
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

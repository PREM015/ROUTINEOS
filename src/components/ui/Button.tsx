"use client";
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Spinner } from './Spinner';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out-expo active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
        outline: "border border-border bg-card/60 text-foreground hover:bg-muted/60 hover:border-foreground/20",
        secondary: "bg-muted text-foreground hover:bg-muted/70 border border-border/60",
        ghost: "text-foreground hover:bg-muted/70",
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
        success: "bg-emerald-600 text-white hover:bg-emerald-600/90 shadow-sm",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-10 py-2 px-4",
        lg: "h-11 px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, ...props }, ref) => {
    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        disabled={isLoading || props.disabled}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading && <Spinner className="h-4 w-4 text-current" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
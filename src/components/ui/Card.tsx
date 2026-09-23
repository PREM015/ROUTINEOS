import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const cardVariants = cva(
  "bg-card text-card-foreground rounded-xl shadow-soft border border-border overflow-hidden",
  {
    variants: {
      variant: {
        default: "",
        elevated: "shadow-floating border-none",
        bordered: "border-2",
        // Hover-lift surface for clickable cards: lift + shadow deepen plus a
        // cursor-tracking spotlight (vars set by useSpotlight on the parent).
        interactive:
          "spotlight-hover transition-all duration-300 ease-out-expo hover:-translate-y-0.5 hover:shadow-floating hover:border-primary/30 cursor-pointer",
      }
    },
    defaultVariants: { variant: "default" }
  }
);

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, variant, ...props }: CardProps) {
  return <div className={cardVariants({ variant, className })} {...props} />;
}
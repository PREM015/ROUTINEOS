import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const cardVariants = cva(
  "bg-card text-card-foreground rounded-xl shadow-sm border border-border overflow-hidden",
  {
    variants: {
      variant: {
        default: "",
        elevated: "shadow-md border-none",
        bordered: "border-2",
      }
    },
    defaultVariants: { variant: "default" }
  }
);

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, variant, ...props }: CardProps) {
  return <div className={cardVariants({ variant, className })} {...props} />;
}

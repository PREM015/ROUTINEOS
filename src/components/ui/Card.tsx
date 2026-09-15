import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const cardVariants = cva(
  "bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden",
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

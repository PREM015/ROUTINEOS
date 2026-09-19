"use client";
/**
 * FormError — renders error text extracted from a validation result.
 *
 * Accepts a single string or the output of a validation call (string[], or a
 * record mapping field names to messages). Message values are flattened,
 * stringified, and deduped, then rendered in a warning-styled block.
 *
 * Props:
 * - result: validation output (string | string[] | Record<string, unknown>)
 * - className: wrapper class
 */

import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FormErrorProps {
  result?: unknown;
  className?: string;
}

/** Flatten any validation result into a deduped list of message strings. */
function extractMessages(result: unknown): string[] {
  if (result === null || result === undefined) {
    return [];
  }
  const buffer: unknown[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      buffer.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(visit);
    } else if (value !== undefined && value !== null) {
      buffer.push(String(value));
    }
  };
  visit(result);
  return [...new Set(buffer.map((msg) => String(msg)).filter((msg) => msg.length > 0))];
}

export function FormError({ result, className }: FormErrorProps) {
  const messages = extractMessages(result);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-0.5">
        {messages.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
    </div>
  );
}

export default FormError;
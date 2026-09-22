"use client";

/**
 * Calendar — a styled month view built on react-day-picker (v8).
 * Supports every DayPicker selection mode (`single`, `multiple`, `range`,
 * `default`) via passthrough props and exposes day-level class functions
 * through `modifiersClassNames` and `classNames`.
 *
 * Usage:
 *   <Calendar mode="single" selected={date} onSelect={setDate} />
 */
import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

const LAYOUT_CLASSNAMES: NonNullable<CalendarProps['classNames']> = {
  root: 'inline-block p-3',
  months: 'flex flex-col gap-4 sm:flex-row sm:gap-0',
  month: 'space-y-4',
  caption: 'relative flex justify-center pt-1',
  caption_label: 'text-sm font-medium text-gray-900',
  nav: 'flex items-center gap-1',
  nav_button:
    'inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
  nav_button_previous: 'absolute left-1 top-1/2 -translate-y-1/2',
  nav_button_next: 'absolute right-1 top-1/2 -translate-y-1/2',
  table: 'w-full border-collapse',
  head_row: 'flex w-full',
  head_cell: 'w-9 rounded-md text-xs font-medium text-gray-500',
  row: 'mt-2 flex w-full',
  cell: 'p-0 text-center text-sm',
  day: 'inline-flex h-9 w-9 items-center justify-center rounded-md font-normal text-gray-900 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:pointer-events-none',
};

const DAY_MODIFIER_CLASSNAMES: NonNullable<CalendarProps['modifiersClassNames']> = {
  selected: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:bg-blue-700',
  today: 'bg-blue-50 text-blue-700 font-semibold',
  outside: 'text-gray-400',
  disabled: 'text-gray-300',
  hidden: 'invisible',
  range_start: 'bg-blue-600 text-white hover:bg-blue-700',
  range_middle: 'bg-blue-100 text-blue-900 hover:bg-blue-100',
  range_end: 'bg-blue-600 text-white hover:bg-blue-700',
};

export function Calendar({
  className,
  classNames,
  modifiersClassNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={className}
      classNames={{ ...LAYOUT_CLASSNAMES, ...classNames }}
      modifiersClassNames={{ ...DAY_MODIFIER_CLASSNAMES, ...modifiersClassNames }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
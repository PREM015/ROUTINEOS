"use client";

/**
 * Dropdown — a Radix dropdown-menu wrapper for building action menus from a
 * declarative item list. Supports icons, destructive styling, disabled
 * items, regex-free shortcuts and optional separators.
 *
 * Usage:
 *   <Dropdown trigger={<Button variant="ghost"><MoreVertical /></Button>}
 *     items={[{ label: 'Edit', icon: PenLine, onSelect: onEdit },
 *             { label: 'Delete', icon: Trash, destructive: true, onSelect: onDelete }]} />
 */
import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export interface DropdownItem {
  /** Discriminator; `'item'` for action rows. */
  kind?: 'item';
  label: React.ReactNode;
  /** Lucide-style icon component (receives `className`). */
  icon?: React.ComponentType<{ className?: string }>;
  onSelect?: () => void;
  /** Renders the item in the danger palette. */
  destructive?: boolean;
  disabled?: boolean;
  /** Right-aligned hint text (e.g. a keyboard shortcut). */
  shortcut?: string;
  /** Draw a separator between this item and the previous one. */
  separatorBefore?: boolean;
}

export interface DropdownMenuLabel {
  kind: 'label';
  label: React.ReactNode;
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: React.ReactNode;
  items: readonly (DropdownItem | DropdownMenuLabel)[];
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  className?: string;
}

function isLabelItem(item: DropdownItem | DropdownMenuLabel): item is DropdownMenuLabel {
  return item.kind === 'label';
}

export function Dropdown({
  trigger,
  items,
  align = 'end',
  side = 'bottom',
  sideOffset = 4,
  className,
}: DropdownProps) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        {React.isValidElement(trigger) ? (
          trigger
        ) : (
          <button type="button" className="text-sm">
            {trigger}
          </button>
        )}
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          side={side}
          sideOffset={sideOffset}
          className={cn(
            'z-50 min-w-[10rem] rounded-lg border border-border bg-card/90 p-1 text-sm text-foreground shadow-floating backdrop-blur-lg outline-none menu-in',
            className,
          )}
        >
          {items.map((item, index) => {
            if (isLabelItem(item)) {
              return (
                <DropdownMenuPrimitive.Label
                  key={`label-${index}`}
                  className="px-2 py-1.5 text-xs font-semibold text-muted-foreground"
                >
                  {item.label}
                </DropdownMenuPrimitive.Label>
              );
            }
            const Icon = item.icon;
            return (
              <FragmentWithSeparator key={index} showSeparator={Boolean(item.separatorBefore)}>
                <DropdownMenuPrimitive.Item
                  disabled={item.disabled}
                  onSelect={item.onSelect}
                  className={cn(
                    'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 outline-none transition-colors focus:bg-muted focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                    item.destructive && 'text-destructive focus:bg-destructive/10 focus:text-destructive',
                  )}
                >
                  {Icon && <Icon className="h-4 w-4 shrink-0" />}
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && <span className="text-xs text-muted-foreground/60">{item.shortcut}</span>}
                </DropdownMenuPrimitive.Item>
              </FragmentWithSeparator>
            );
          })}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

function FragmentWithSeparator({
  showSeparator,
  children,
}: {
  showSeparator: boolean;
  children: React.ReactNode;
}) {
  return (
    <React.Fragment>
      {showSeparator && <DropdownMenuPrimitive.Separator className="my-1 h-px bg-border" />}
      {children}
    </React.Fragment>
  );
}
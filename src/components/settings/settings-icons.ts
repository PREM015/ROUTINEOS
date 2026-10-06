import {
  Bell,
  CalendarRange,
  Clock,
  CreditCard,
  Database,
  Download,
  EyeOff,
  FileUp,
  KeyRound,
  LayoutDashboard,
  MonitorSmartphone,
  Moon,
  Palette,
  Plug,
  Quote,
  Receipt,
  Repeat,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  TriangleAlert,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { SettingsIconKey } from '@/lib/settings/manifest';

/**
 * The complete icon registry for the settings directory.
 *
 * Typed `Record<SettingsIconKey, LucideIcon>` rather than
 * `Record<string, LucideIcon>`, so it fails both ways:
 *
 *   - a destination declaring an icon key that is not in `SettingsIconKey` is a
 *     compile error in `lib/settings/manifest.ts`, and
 *   - a key added to `SettingsIconKey` without a component here is a compile
 *     error in this file.
 *
 * That replaces `ICONS[link.name as SettingsIconKey]`, where a rename or a new
 * link with a name that did not match a key produced `undefined` and crashed the
 * render — a cast silences exactly the check that would have caught it.
 *
 * This file is deliberately free of `'use client'` and of any React import beyond
 * the icons themselves: the test suite imports it directly in the `node`
 * environment to assert registry coverage.
 */
export const SETTINGS_ICONS: Record<SettingsIconKey, LucideIcon> = {
  profile: User,
  appearance: Palette,
  timezone: Clock,
  dashboard: LayoutDashboard,
  habits: Repeat,
  routine: CalendarRange,
  focus: Timer,
  sleep: Moon,
  quotes: Quote,
  scoring: SlidersHorizontal,
  notifications: Bell,
  security: ShieldCheck,
  sessions: MonitorSmartphone,
  privacy: EyeOff,
  integrations: Plug,
  apiKeys: KeyRound,
  subscription: CreditCard,
  billing: Receipt,
  data: Database,
  export: Download,
  import: FileUp,
  danger: TriangleAlert,
};
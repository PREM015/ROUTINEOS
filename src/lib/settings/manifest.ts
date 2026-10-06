/**
 * The `/settings` directory manifest.
 *
 * This is pure data plus a pure filter. It deliberately imports nothing — no
 * React, no icons, no repository, no `@/lib/prisma` — so the hub page can stay a
 * Server Component, the search island can be handed this object across the RSC
 * boundary as plain serialisable data, and the test suite can exercise the
 * filtering rules in the `node` environment.
 *
 * Icons live beside this file (`components/settings/settings-icons.ts`), keyed by
 * the `SettingsIconKey` union declared here. That inversion is what makes a new
 * destination fail `tsc` when it has no icon, instead of rendering `<undefined />`
 * and crashing the page at runtime, which is what the previous
 * `ICONS[link.name as SettingsIconKey]` lookup did.
 */

export type SettingsIconKey =
  | 'profile'
  | 'appearance'
  | 'timezone'
  | 'dashboard'
  | 'habits'
  | 'routine'
  | 'focus'
  | 'sleep'
  | 'quotes'
  | 'scoring'
  | 'notifications'
  | 'security'
  | 'sessions'
  | 'privacy'
  | 'integrations'
  | 'apiKeys'
  | 'subscription'
  | 'billing'
  | 'data'
  | 'export'
  | 'import'
  | 'danger';

/**
 * `danger` is the only tone, and it exists so exactly one card on the page
 * reads as sensitive. The destructive workflow itself — confirmation phrase,
 * second confirm step — stays on `/settings/danger-zone`; the hub only warns
 * before navigation.
 */
export type SettingsTone = 'default' | 'danger';

export interface SettingsDestination {
  /** Stable React key and test handle. Unique across the whole manifest. */
  id: string;
  name: string;
  /** Site-relative path. Must resolve to a real route under `app/(dashboard)/settings`. */
  href: string;
  /**
   * One line, describing what the destination actually does. These are checked
   * against each page's own `<h1>`/subtitle copy — the Dashboard card previously
   * promised a "default dashboard view", a control that page has never had.
   */
  desc: string;
  icon: SettingsIconKey;
  tone: SettingsTone;
  /**
   * Extra search terms that are not in `name` or `desc`: the words a user would
   * actually type ("tz", "2fa", "delete", "invoice"). Purely additive — these
   * are matched but never rendered, so the visible copy stays uncluttered.
   */
  keywords: readonly string[];
}

export interface SettingsGroup {
  /**
   * Used to build `aria-labelledby`. Must be a valid single-token HTML id: the
   * previous code interpolated the title, so "Account & Safety" produced
   * `id="settings-group-Account & Safety"` and `aria-labelledby` resolved that
   * as three separate tokens, leaving those sections unnamed.
   */
  id: string;
  title: string;
  blurb: string;
  destinations: readonly SettingsDestination[];
}

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    id: 'preferences',
    title: 'Preferences',
    blurb: 'How the app looks and how your day is measured.',
    destinations: [
      {
        id: 'profile',
        name: 'Profile',
        href: '/settings/profile',
        desc: 'Update your public profile information',
        icon: 'profile',
        tone: 'default',
        keywords: ['name', 'username', 'avatar', 'bio'],
      },
      {
        id: 'appearance',
        name: 'Appearance',
        href: '/settings/appearance',
        desc: 'Theme, animations and compact mode',
        icon: 'appearance',
        tone: 'default',
        keywords: ['theme', 'dark', 'light', 'motion', 'compact'],
      },
      {
        id: 'timezone',
        name: 'Time Zone',
        href: '/settings/timezone',
        desc: 'The timezone used for your local day',
        icon: 'timezone',
        tone: 'default',
        keywords: ['tz', 'clock', 'dates', 'reviews'],
      },
      {
        id: 'dashboard',
        name: 'Dashboard',
        href: '/settings/dashboard',
        desc: 'Choose which widgets appear on your dashboard',
        icon: 'dashboard',
        tone: 'default',
        keywords: ['widgets', 'home', 'per device'],
      },
      {
        id: 'habits',
        name: 'Habits',
        href: '/settings/habits',
        desc: 'Reminder defaults for all habits',
        icon: 'habits',
        tone: 'default',
        keywords: ['reminders', 'defaults'],
      },
      {
        id: 'routine',
        name: 'Routine',
        href: '/settings/routine',
        desc: 'Templates for different day types',
        icon: 'routine',
        tone: 'default',
        keywords: ['blocks', 'templates', 'schedule'],
      },
      {
        /*
          Was missing entirely. `settings/focus/page.tsx` existed and was
          reachable only by typing the URL or following a link from somewhere
          else in the focus UI — `/settings` is the directory of record, so an
          unlisted destination page is an orphan. The route-existence test below
          is what now makes a *new* settings page impossible to leave out: it
          asserts the manifest covers every `page.tsx` under the directory.
        */
        id: 'focus',
        name: 'Focus',
        href: '/settings/focus',
        desc: 'Timer lengths, break length and session reflection',
        icon: 'focus',
        tone: 'default',
        keywords: ['pomodoro', 'timer', 'sessions', 'breaks', 'deep work'],
      },
      {
        id: 'sleep',
        name: 'Sleep',
        href: '/settings/sleep',
        desc: 'Targets, reminders and automatic sessions',
        icon: 'sleep',
        tone: 'default',
        keywords: ['bedtime', 'target', 'reminder'],
      },
      {
        id: 'quotes',
        name: 'Quotes',
        href: '/settings/quotes',
        desc: 'Your own quotes and the widget pool',
        icon: 'quotes',
        tone: 'default',
        keywords: ['motivation', 'widget', 'pool'],
      },
      {
        id: 'scoring',
        name: 'Scoring Weights',
        href: '/settings/scoring',
        desc: 'Adjust how habits are scored',
        icon: 'scoring',
        tone: 'default',
        keywords: ['weights', 'points', 'score'],
      },
      {
        id: 'notifications',
        name: 'Notifications',
        href: '/settings/notifications',
        desc: 'Which reminders you get, and when',
        icon: 'notifications',
        tone: 'default',
        keywords: ['reminders', 'alerts', 'push', 'email'],
      },
    ],
  },
  {
    id: 'account-safety',
    title: 'Account & Safety',
    blurb: 'Sign-in, trusted devices and who can see you.',
    destinations: [
      {
        id: 'security',
        name: 'Security',
        href: '/settings/security',
        desc: 'Password and two-factor authentication',
        icon: 'security',
        tone: 'default',
        keywords: ['password', '2fa', 'two factor', 'mfa', 'totp'],
      },
      {
        id: 'sessions',
        name: 'Active Sessions',
        href: '/settings/sessions',
        desc: 'Devices currently signed in to your account',
        icon: 'sessions',
        tone: 'default',
        keywords: ['devices', 'logins', 'sign out', 'revoke'],
      },
      {
        id: 'privacy',
        name: 'Privacy',
        href: '/settings/privacy',
        desc: 'Control who can see your profile and stats',
        icon: 'privacy',
        tone: 'default',
        keywords: ['visibility', 'public', 'stats'],
      },
    ],
  },
  {
    id: 'integrations-api',
    title: 'Integrations & API',
    blurb: 'Connect other services and automate access.',
    destinations: [
      {
        id: 'integrations',
        name: 'Integrations',
        href: '/settings/integrations',
        desc: 'Sync data with external services',
        icon: 'integrations',
        tone: 'default',
        keywords: ['connect', 'sync', 'calendar'],
      },
      {
        id: 'api-keys',
        name: 'API Keys',
        href: '/settings/api-keys',
        desc: 'Keys for the REST API — shown once',
        icon: 'apiKeys',
        tone: 'default',
        keywords: ['token', 'rest', 'developer', 'integration'],
      },
    ],
  },
  {
    id: 'billing',
    title: 'Billing',
    blurb: 'Your plan, payment method and invoices.',
    destinations: [
      {
        id: 'subscription',
        name: 'Subscription',
        href: '/settings/subscription',
        desc: 'Your current plan and usage',
        icon: 'subscription',
        tone: 'default',
        keywords: ['plan', 'upgrade', 'tier', 'usage'],
      },
      {
        id: 'billing',
        name: 'Billing',
        href: '/settings/billing',
        desc: 'Payment method and invoices',
        icon: 'billing',
        tone: 'default',
        keywords: ['payment', 'card', 'invoice', 'receipt'],
      },
    ],
  },
  {
    id: 'account-data',
    title: 'Account & Data',
    blurb: 'Move your data in and out, or close the account.',
    destinations: [
      {
        id: 'data',
        name: 'Data',
        href: '/settings/data',
        desc: 'How long your data is kept and what it holds',
        icon: 'data',
        tone: 'default',
        keywords: ['storage', 'retention', 'manage'],
      },
      {
        id: 'export',
        name: 'Export',
        href: '/settings/export',
        desc: 'Download a portable copy of your data',
        icon: 'export',
        tone: 'default',
        keywords: ['download', 'backup', 'json'],
      },
      {
        id: 'import',
        name: 'Import',
        href: '/settings/import',
        desc: 'Restore from a JSON backup file',
        icon: 'import',
        tone: 'default',
        keywords: ['restore', 'backup', 'json'],
      },
      {
        id: 'danger-zone',
        name: 'Danger Zone',
        href: '/settings/danger-zone',
        desc: 'Permanently delete your account',
        icon: 'danger',
        tone: 'danger',
        keywords: ['delete', 'close account', 'remove account', 'erase'],
      },
    ],
  },
];

/** Total number of destinations, i.e. the "22 settings" figure in the header. */
export function countSettingsDestinations(groups = SETTINGS_GROUPS): number {
  return groups.reduce((total, group) => total + group.destinations.length, 0);
}

/** Flat manifest, in render order. */
export function flattenSettingsDestinations(
  groups = SETTINGS_GROUPS
): SettingsDestination[] {
  return groups.flatMap((group) => [...group.destinations]);
}

/**
 * Lowercase, trimmed, punctuation-stripped — the form used on both sides of every
 * comparison below. `Time Zone` and `time-zone` are the same query.
 */
export function normalizeSettingsQuery(value: string): string {
  // Trim *after* collapsing separators: trimming first leaves `'  Time-Zone_ '`
  // as `'time zone '`, a trailing space that makes the token split below emit an
  // empty final token.
  return value.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

/** Everything a destination can be found by, as one comparable string. */
function destinationHaystack(destination: SettingsDestination): string {
  return normalizeSettingsQuery(
    [destination.name, destination.desc, ...destination.keywords].join(' ')
  );
}

/** Everything a group heading can be found by. */
function groupHaystack(group: SettingsGroup): string {
  return normalizeSettingsQuery(`${group.title} ${group.blurb}`);
}

/**
 * Filter the directory.
 *
 * Every whitespace-separated token must match somewhere (AND, not OR) so that
 * "dark compact" narrows rather than widens. A token matching a group's own
 * title or blurb keeps that whole group — searching "billing" should surface the
 * Billing section, not just the two cards whose text happens to repeat the word.
 * Groups left with no matching destination are dropped rather than rendered as an
 * empty heading.
 */
export function filterSettingsGroups(
  query: string,
  groups: readonly SettingsGroup[] = SETTINGS_GROUPS
): SettingsGroup[] {
  const tokens = normalizeSettingsQuery(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return groups as SettingsGroup[];

  const filtered: SettingsGroup[] = [];

  for (const group of groups) {
    const groupText = groupHaystack(group);
    const matchesGroup = tokens.every((token) => groupText.includes(token));

    const destinations = matchesGroup
      ? [...group.destinations]
      : group.destinations.filter((destination) => {
          const haystack = destinationHaystack(destination);
          return tokens.every((token) => haystack.includes(token));
        });

    if (destinations.length > 0) filtered.push({ ...group, destinations });
  }

  return filtered;
}

/** How many destinations a filtered result set contains. */
export function countFilteredDestinations(groups: readonly SettingsGroup[]): number {
  return groups.reduce((total, group) => total + group.destinations.length, 0);
}
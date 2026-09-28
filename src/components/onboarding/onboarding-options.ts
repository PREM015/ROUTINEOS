/**
 * Shared option lists for the onboarding wizard.
 *
 * The timezone list used to be four hard-coded options built inline in
 * `TimezoneStep`, which meant the value the user picked was both a poor choice
 * and never persisted anywhere.
 */

/** A short, curated list plus whatever `Intl` reports for this browser. */
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = (() => {
  const curated = [
    'UTC',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Africa/Lagos',
    'Africa/Cairo',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
    'Pacific/Auckland',
  ];

  const detected =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : null;

  const all = new Set(curated);
  if (detected) all.add(detected);

  return [...all].sort().map((zone) => ({ value: zone, label: zone }));
})();

/**
 * The routine templates offered during onboarding.
 *
 * The ids match `DEFAULT_TEMPLATES` in `src/lib/constants/templates.ts`, which
 * is what `POST /api/templates/use` resolves against. Previously this step
 * rendered two cards that both just advanced the wizard, so no template was
 * ever applied.
 */
export const ONBOARDING_ROUTINE_TEMPLATES = [
  {
    id: 'morning-routine',
    name: 'Workday Optimizer',
    description:
      'Focused on deep work, regular breaks, and an evening wind-down.',
  },
  {
    id: 'evening-routine',
    name: 'Balanced Life',
    description: 'Mix of fitness, learning, and steady productivity.',
  },
] as const;

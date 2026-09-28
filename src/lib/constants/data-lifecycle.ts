/**
 * Data-lifecycle option lists for the Settings > Data page.
 *
 * The numeric values here must stay within the bounds enforced by
 * `updateSettingsSchema` in `src/lib/validation/settings.schema.ts`:
 *   dataRetentionDays        30 – 3650
 *   retroactiveEditDays       0 – 30
 *   autoArchiveCompletedDays  0 – 365
 */

export interface DataLifecycleOption {
  value: string;
  label: string;
}

export const RETENTION_OPTIONS: DataLifecycleOption[] = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '6 months' },
  { value: '365', label: '1 year' },
  { value: '730', label: '2 years' },
  { value: '3650', label: '10 years' },
];

export const EDIT_WINDOW_OPTIONS: DataLifecycleOption[] = [
  { value: '0', label: 'Today only' },
  { value: '1', label: '1 day back' },
  { value: '3', label: '3 days back' },
  { value: '7', label: '1 week back' },
  { value: '14', label: '2 weeks back' },
  { value: '30', label: '30 days back' },
];

export const ARCHIVE_OPTIONS: DataLifecycleOption[] = [
  { value: '0', label: 'Never' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '365', label: '1 year' },
];

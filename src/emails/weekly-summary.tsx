/**
 * Weekly summary email template.
 *
 * Renders a static HTML digest of the user's performance for the week.
 * Exported as a default function consumed by `src/lib/email/templates.ts`.
 */

export interface WeeklySummaryStats {
  /** Average daily score for the period (0-100). */
  scoreAvg: number;
  /** Number of habits completed during the period. */
  habitsCompleted: number;
  /** Number of goals completed during the period. */
  goalsCompleted: number;
  /** Total focus minutes logged during the period. */
  focusMinutes: number;
}

export interface WeeklySummaryProps {
  /** Recipient's first name (falls back to "there"). */
  name?: string;
  /** Human-readable label for the summarized period (e.g. "Sep 6 - Sep 12"). */
  periodLabel?: string;
  /** Aggregated stats for the period. */
  stats?: Partial<WeeklySummaryStats>;
}

const EMAIL_BG = '#0B1120';
const EMAIL_ACCENT = '#3B82F6';
const EMAIL_CARD = '#FFFFFF';

const APP_BASE =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXTAUTH_URL ??
  'http://localhost:3000';

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours <= 0) return `${mins}m`;
  if (mins <= 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function renderStatTile(label: string, value: string): string {
  return `
    <td
      style="width: 50%; padding: 12px; background-color: #F1F5F9; border-radius: 8px; text-align: center;"
    >
      <div style="font-size: 22px; font-weight: 700; color: #0F172A;">${value}</div>
      <div style="font-size: 12px; color: #64748B; margin-top: 4px;">${label}</div>
    </td>
  `;
}

export default function WeeklySummary({
  name = 'there',
  periodLabel = 'this week',
  stats = {},
}: WeeklySummaryProps = {}): string {
  const displayName = name && name.trim().length > 0 ? name.trim() : 'there';
  const scoreAvg = Number.isFinite(stats.scoreAvg) ? String(stats.scoreAvg) : '—';
  const habitsCompleted = Number.isFinite(stats.habitsCompleted)
    ? String(stats.habitsCompleted)
    : '—';
  const goalsCompleted = Number.isFinite(stats.goalsCompleted)
    ? String(stats.goalsCompleted)
    : '—';
  const focusMinutes = Number.isFinite(stats.focusMinutes)
    ? formatMinutes(stats.focusMinutes as number)
    : '—';

  return `<!DOCTYPE html>
<html>
  <body style="margin: 0; padding: 0; background-color: ${EMAIL_BG}; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${EMAIL_BG}">
      <tbody>
        <tr>
          <td align="center" style="padding: 40px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px;">
              <!-- Brand header -->
              <tbody>
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <span style="font-size: 18px; font-weight: 700; color: ${EMAIL_ACCENT}; letter-spacing: 1px;">
                      ROUTINEOS
                    </span>
                  </td>
                </tr>
              </tbody>

              <!-- White card -->
              <tbody>
                <tr>
                  <td style="background-color: ${EMAIL_CARD}; border-radius: 12px; padding: 32px;">
                    <h1 style="margin: 0 0 16px; font-size: 24px; color: #0F172A; line-height: 1.3;">
                      Your weekly summary, ${displayName}
                    </h1>
                    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.7; color: #334155;">
                      Here's how ${periodLabel} went. Keep building on these wins.
                    </p>

                    <!-- Stats grid -->
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tbody>
                        <tr>
                          ${renderStatTile("Avg score", scoreAvg)}
                          <td style="width: 12px;"></td>
                          ${renderStatTile("Habits done", habitsCompleted)}
                        </tr>
                        <tr>
                          <td style="height: 12px;"></td>
                        </tr>
                        <tr>
                          ${renderStatTile("Goals done", goalsCompleted)}
                          <td style="width: 12px;"></td>
                          ${renderStatTile("Focus time", focusMinutes)}
                        </tr>
                      </tbody>
                    </table>

                    <!-- CTA button -->
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0 20px;">
                      <tbody>
                        <tr>
                          <td align="center">
                            <a
                              href="${APP_BASE}/analytics"
                              style="display: inline-block; padding: 14px 32px; background-color: ${EMAIL_ACCENT}; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;"
                            >
                              View full analytics
                            </a>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p style="margin: 0; font-size: 13px; color: #64748B; text-align: center;">
                      Turn off weekly summaries in your notification settings any time.
                    </p>
                  </td>
                </tr>
              </tbody>

              <!-- Footer -->
              <tbody>
                <tr>
                  <td align="center" style="padding-top: 24px;">
                    <p style="margin: 0; font-size: 12px; color: #64748B;">
                      This email was sent automatically by RoutineOS.
                    </p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #475569;">
                      RoutineOS — build better routines, one day at a time.
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
}
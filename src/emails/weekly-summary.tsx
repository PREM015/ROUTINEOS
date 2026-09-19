/**
 * Weekly summary email template.
 *
 * Renders a static HTML digest of the user's performance for the week.
 * Exported as a named component and as the default export consumed by
 * `src/lib/email/templates.ts`. `renderWeeklySummary` serializes the component
 * to an HTML string via `renderToStaticMarkup`.
 */

import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <td
      style={{
        width: '50%',
        padding: '12px',
        backgroundColor: '#F1F5F9',
        borderRadius: '8px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '22px', fontWeight: 700, color: '#0F172A' }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>{label}</div>
    </td>
  );
}

export function WeeklySummary({
  name = 'there',
  periodLabel = 'this week',
  stats = {},
}: WeeklySummaryProps) {
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

  return (
    <html>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: EMAIL_BG,
          fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <table role="presentation" cellPadding="0" cellSpacing="0" width="100%" style={{ backgroundColor: EMAIL_BG }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '40px 16px' }}>
                <table role="presentation" cellPadding="0" cellSpacing="0" width="100%" style={{ maxWidth: '560px' }}>
                  {/* Brand header */}
                  <tbody>
                    <tr>
                      <td align="center" style={{ paddingBottom: '24px' }}>
                        <span style={{ fontSize: '18px', fontWeight: 700, color: EMAIL_ACCENT, letterSpacing: '1px' }}>
                          ROUTINEOS
                        </span>
                      </td>
                    </tr>
                  </tbody>

                  {/* White card */}
                  <tbody>
                    <tr>
                      <td style={{ backgroundColor: EMAIL_CARD, borderRadius: '12px', padding: '32px' }}>
                        <h1 style={{ margin: '0 0 16px', fontSize: '24px', color: '#0F172A', lineHeight: 1.3 }}>
                          Your weekly summary, {displayName}
                        </h1>
                        <p style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: 1.7, color: '#334155' }}>
                          Here&apos;s how {periodLabel} went. Keep building on these wins.
                        </p>

                        {/* Stats grid */}
                        <table role="presentation" cellPadding="0" cellSpacing="0" width="100%">
                          <tbody>
                            <tr>
                              <StatTile label="Avg score" value={scoreAvg} />
                              <td style={{ width: '12px' }} />
                              <StatTile label="Habits done" value={habitsCompleted} />
                            </tr>
                            <tr>
                              <td style={{ height: '12px' }} />
                            </tr>
                            <tr>
                              <StatTile label="Goals done" value={goalsCompleted} />
                              <td style={{ width: '12px' }} />
                              <StatTile label="Focus time" value={focusMinutes} />
                            </tr>
                          </tbody>
                        </table>

                        {/* CTA button */}
                        <table role="presentation" cellPadding="0" cellSpacing="0" width="100%" style={{ margin: '28px 0 20px' }}>
                          <tbody>
                            <tr>
                              <td align="center">
                                <a
                                  href={`${APP_BASE}/analytics`}
                                  style={{
                                    display: 'inline-block',
                                    padding: '14px 32px',
                                    backgroundColor: EMAIL_ACCENT,
                                    color: '#FFFFFF',
                                    fontSize: '15px',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    borderRadius: '8px',
                                  }}
                                >
                                  View full analytics
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748B', textAlign: 'center' }}>
                          Turn off weekly summaries in your notification settings any time.
                        </p>
                      </td>
                    </tr>
                  </tbody>

                  {/* Footer */}
                  <tbody>
                    <tr>
                      <td align="center" style={{ paddingTop: '24px' }}>
                        <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                          This email was sent automatically by RoutineOS.
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#475569' }}>
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
    </html>
  );
}

export default WeeklySummary as unknown as ComponentType<Record<string, unknown>>;

/**
 * Serialize the weekly summary template to a static HTML string.
 */
export function renderWeeklySummary(props: WeeklySummaryProps = {}): string {
  return renderToStaticMarkup(<WeeklySummary {...props} />);
}
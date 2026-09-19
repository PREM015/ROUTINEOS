/**
 * Habit reminder email template.
 *
 * Renders a static HTML nudge to complete a habit today. Exported as a named
 * component and as the default export consumed by `src/lib/email/templates.ts`.
 * `renderHabitReminder` serializes the component to an HTML string via
 * `renderToStaticMarkup`.
 */

import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

export interface HabitReminderProps {
  /** Recipient's first name (falls back to "there"). */
  name?: string;
  /** Name of the habit to complete. */
  habitName?: string;
  /** Target date label for the reminder (e.g. "Sunday, Sep 20"). */
  date?: string;
}

const EMAIL_BG = '#0B1120';
const EMAIL_ACCENT = '#3B82F6';
const EMAIL_CARD = '#FFFFFF';

const APP_BASE =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXTAUTH_URL ??
  'http://localhost:3000';

export function HabitReminder({
  name = 'there',
  habitName = 'your habit',
  date = new Date().toDateString(),
}: HabitReminderProps) {
  const displayName = name && name.trim().length > 0 ? name.trim() : 'there';
  const displayHabit =
    habitName && habitName.trim().length > 0 ? habitName.trim() : 'your habit';

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
                          It&apos;s time for {displayHabit}, {displayName}
                        </h1>
                        <p style={{ margin: '0 0 8px', fontSize: '15px', lineHeight: 1.7, color: '#334155' }}>
                          Don&apos;t let the streak slip — today is a day for {displayHabit}.
                          A few focused minutes now will keep your routine on track.
                        </p>
                        <p style={{ margin: '0 0 8px', fontSize: '15px', lineHeight: 1.7, color: '#334155' }}>
                          <strong>Target:</strong> {date}
                        </p>
                        {/* CTA button */}
                        <table role="presentation" cellPadding="0" cellSpacing="0" width="100%" style={{ margin: '28px 0 20px' }}>
                          <tbody>
                            <tr>
                              <td align="center">
                                <a
                                  href={`${APP_BASE}/today`}
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
                                  Open today&apos;s plan
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748B', textAlign: 'center' }}>
                          You can turn off habit reminder emails in your notification settings.
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

export default HabitReminder as unknown as ComponentType<Record<string, unknown>>;

/**
 * Serialize the habit reminder template to a static HTML string.
 */
export function renderHabitReminder(props: HabitReminderProps = {}): string {
  return renderToStaticMarkup(<HabitReminder {...props} />);
}
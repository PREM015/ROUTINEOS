/**
 * Password reset email template.
 *
 * Renders a static HTML message with a one-time link to reset the recipient's
 * password. Exported as a named component and as the default export consumed
 * by `src/lib/email/templates.ts`. `renderPasswordReset` serializes the
 * component to an HTML string via `renderToStaticMarkup`.
 */

import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

export interface PasswordResetProps {
  /** Recipient's first name (falls back to "there"). */
  name?: string;
  /** Absolute URL carrying the one-time reset token. */
  resetUrl?: string;
  /** Number of hours until the reset link expires. */
  expiresHours?: number;
}

const EMAIL_BG = '#0B1120';
const EMAIL_ACCENT = '#3B82F6';
const EMAIL_CARD = '#FFFFFF';

const APP_BASE =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXTAUTH_URL ??
  'http://localhost:3000';

export function PasswordReset({
  name = 'there',
  resetUrl = `${APP_BASE}/reset-password`,
  expiresHours = 1,
}: PasswordResetProps) {
  const displayName = name && name.trim().length > 0 ? name.trim() : 'there';

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
                          Reset your password, {displayName}
                        </h1>
                        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.7, color: '#334155' }}>
                          We received a request to reset the password for your RoutineOS account.
                          Click the button below to choose a new one. This link is valid for the
                          next {expiresHours > 0 ? expiresHours : 1}{' '}
                          {expiresHours === 1 ? 'hour' : 'hours'}.
                        </p>
                        {/* CTA button */}
                        <table role="presentation" cellPadding="0" cellSpacing="0" width="100%" style={{ margin: '28px 0 20px' }}>
                          <tbody>
                            <tr>
                              <td align="center">
                                <a
                                  href={resetUrl}
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
                                  Reset password
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748B', textAlign: 'center' }}>
                          If the button doesn&apos;t work, copy this link into your browser:{' '}
                          <a href={resetUrl} style={{ color: EMAIL_ACCENT }}>
                            {resetUrl}
                          </a>
                        </p>
                        <hr style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '24px 0' }} />
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748B' }}>
                          Didn&apos;t request this? You can safely ignore this email. Your password
                          won&apos;t change unless you use the link above.
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

export default PasswordReset as unknown as ComponentType<Record<string, unknown>>;

/**
 * Serialize the password reset template to a static HTML string.
 */
export function renderPasswordReset(props: PasswordResetProps = {}): string {
  return renderToStaticMarkup(<PasswordReset {...props} />);
}
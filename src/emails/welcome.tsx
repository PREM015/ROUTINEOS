/**
 * Welcome email template.
 *
 * Renders a static HTML welcome message for newly registered RoutineOS users.
 * Exported as a named component for typed use inside React trees and as the
 * default export consumed by the template registry in
 * `src/lib/email/templates.ts`. `renderWelcomeEmail` serializes the component
 * to an HTML string via `renderToStaticMarkup`.
 */

import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

export interface WelcomeEmailProps {
  /** Recipient's first name (falls back to "there"). */
  name?: string;
  /** Absolute URL for the "log in" call-to-action. */
  loginUrl?: string;
}

const EMAIL_BG = '#0B1120';
const EMAIL_ACCENT = '#3B82F6';
const EMAIL_CARD = '#FFFFFF';

const APP_BASE =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXTAUTH_URL ??
  'http://localhost:3000';

export function WelcomeEmail({
  name = 'there',
  loginUrl = `${APP_BASE}/login`,
}: WelcomeEmailProps) {
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
                          Welcome to RoutineOS{displayName === 'there' ? '' : `, ${displayName}`}!
                        </h1>
                        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.7, color: '#334155' }}>
                          We&apos;re thrilled to have you on board. RoutineOS helps you turn your
                          everyday plans into steady, rewarding habits — build routines, track your
                          goals, and keep your health and energy in balance.
                        </p>
                        {/* CTA button */}
                        <table role="presentation" cellPadding="0" cellSpacing="0" width="100%" style={{ margin: '28px 0 20px' }}>
                          <tbody>
                            <tr>
                              <td align="center">
                                <a
                                  href={loginUrl}
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
                                  Log in to RoutineOS
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748B', textAlign: 'center' }}>
                          If the button doesn&apos;t work, copy this link into your browser:{' '}
                          <a href={loginUrl} style={{ color: EMAIL_ACCENT }}>
                            {loginUrl}
                          </a>
                        </p>
                      </td>
                    </tr>
                  </tbody>

                  {/* Footer */}
                  <tbody>
                    <tr>
                      <td align="center" style={{ paddingTop: '24px' }}>
                        <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                          You received this email because an account was created for you on RoutineOS.
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

export default WelcomeEmail as unknown as ComponentType<Record<string, unknown>>;

/**
 * Serialize the welcome email to a static HTML string.
 */
export function renderWelcomeEmail(props: WelcomeEmailProps = {}): string {
  return renderToStaticMarkup(<WelcomeEmail {...props} />);
}
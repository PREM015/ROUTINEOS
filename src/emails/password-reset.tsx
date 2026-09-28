/**
 * Password reset email template.
 *
 * Renders a static HTML message with a one-time link to reset the recipient's
 * password. Exported as a default function consumed by `src/lib/email/templates.ts`.
 */

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

export default function PasswordReset({
  name = 'there',
  resetUrl = `${APP_BASE}/reset-password`,
  expiresHours = 1,
}: PasswordResetProps = {}): string {
  const displayName = name && name.trim().length > 0 ? name.trim() : 'there';
  const displayHours = expiresHours > 0 ? expiresHours : 1;
  const hoursWord = expiresHours === 1 ? 'hour' : 'hours';

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
                      Reset your password, ${displayName}
                    </h1>
                    <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #334155;">
                      We received a request to reset the password for your RoutineOS account.
                      Click the button below to choose a new one. This link is valid for the
                      next ${displayHours} ${hoursWord}.
                    </p>
                    <!-- CTA button -->
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0 20px;">
                      <tbody>
                        <tr>
                          <td align="center">
                            <a
                              href="${resetUrl}"
                              style="display: inline-block; padding: 14px 32px; background-color: ${EMAIL_ACCENT}; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;"
                            >
                              Reset password
                            </a>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p style="margin: 0; font-size: 13px; color: #64748B; text-align: center;">
                      If the button doesn't work, copy this link into your browser: 
                      <a href="${resetUrl}" style="color: ${EMAIL_ACCENT};">
                        ${resetUrl}
                      </a>
                    </p>
                    <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
                    <p style="margin: 0; font-size: 13px; color: #64748B;">
                      Didn't request this? You can safely ignore this email. Your password
                      won't change unless you use the link above.
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
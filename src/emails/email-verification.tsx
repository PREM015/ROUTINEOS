/**
 * Email verification template.
 *
 * Renders a static HTML message asking the recipient to confirm their email
 * address. Exported as a default function consumed by the template registry in
 * `src/lib/email/templates.ts`.
 */

export interface EmailVerificationProps {
  /** Recipient's first name (falls back to "there"). */
  name?: string;
  /** Absolute URL carrying the one-time verification token. */
  verifyUrl?: string;
}

const EMAIL_BG = '#0B1120';
const EMAIL_ACCENT = '#3B82F6';
const EMAIL_CARD = '#FFFFFF';

const APP_BASE =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXTAUTH_URL ??
  'http://localhost:3000';

export default function EmailVerification({
  name = 'there',
  verifyUrl = `${APP_BASE}/verify-email`,
}: EmailVerificationProps = {}): string {
  const displayName = name && name.trim().length > 0 ? name.trim() : 'there';

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
                      Verify your email address, ${displayName}
                    </h1>
                    <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #334155;">
                      Thanks for joining RoutineOS! Please confirm that this email address
                      belongs to you so we can activate your account and keep your data secure.
                      This link will expire in 24 hours.
                    </p>
                    <!-- CTA button -->
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0 20px;">
                      <tbody>
                        <tr>
                          <td align="center">
                            <a
                              href="${verifyUrl}"
                              style="display: inline-block; padding: 14px 32px; background-color: ${EMAIL_ACCENT}; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;"
                            >
                              Verify email address
                            </a>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p style="margin: 0; font-size: 13px; color: #64748B; text-align: center;">
                      If the button doesn't work, copy this link into your browser: 
                      <a href="${verifyUrl}" style="color: ${EMAIL_ACCENT};">
                        ${verifyUrl}
                      </a>
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
                      If you didn't create an account, you can safely ignore this email.
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
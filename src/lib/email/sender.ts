/**
 * Email transport adapter.
 *
 * Two modes, chosen at runtime by environment:
 * - `RESEND_API_KEY` present → send via the Resend REST API (no SDK required).
 * - otherwise → "dev" mode: compose the payload and log it instead of sending,
 *   returning a deterministic result so downstream flows keep working.
 *
 * The API surface is intentionally small and dependency-free.
 */

import { renderTemplate, DEFAULT_FROM, subjectFor } from './templates';
import type { EmailTemplateName, TemplateData } from './templates';

export interface SendEmailOptions {
  to: string;
  from?: string;
  subject?: string;
  template: EmailTemplateName;
  data?: TemplateData;
  html?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  subject: string;
  to: string;
  html: string;
  transport: 'resend' | 'dev-log' | 'none';
  error?: string;
}

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Send an email. When `html` is omitted the template is rendered on the fly;
 * rendering borrows the graceful fallback from `renderTemplate`.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const to = options.to;
  const from = options.from ?? DEFAULT_FROM;
  const html = options.html ?? (await renderTemplate(options.template, options.data));
  const finalSubject = options.subject ?? resolveSubject(options.template, options.data);

  const apiKey = process.env.RESEND_API_KEY ?? '';

  if (!apiKey) {
    if ((process.env.NODE_ENV ?? 'development') === 'development') {
      console.info('[routineos:email] (dev-log) would send to %s', to, {
        subject: finalSubject,
        template: options.template,
        htmlLength: html.length,
      });
    }
    return {
      ok: true,
      subject: finalSubject,
      to,
      html,
      transport: 'dev-log',
    };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject: finalSubject, html }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return {
        ok: false,
        subject: finalSubject,
        to,
        html,
        transport: 'none',
        error: `Resend responded ${response.status}: ${detail.slice(0, 500)}`,
      };
    }

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
    };
    return {
      ok: true,
      id: payload.id,
      subject: finalSubject,
      to,
      html,
      transport: 'resend',
    };
  } catch (error) {
    return {
      ok: false,
      subject: finalSubject,
      to,
      html,
      transport: 'none',
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

function resolveSubject(
  template: EmailTemplateName,
  data?: TemplateData
): string {
  return subjectFor(template, data ?? {});
}
/**
 * Email template rendering and subject resolution.
 *
 * Renders the shared (`src/emails`) React components to static HTML on the
 * server. Because several of those components are still stubs, rendering is
 * wrapped defensively: when a component fails to load/render, a plain HTML
 * fallback (built from the data) is returned instead of throwing.
 */

import { createElement } from 'react';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/** Names of the known email templates in `src/emails`. */
export type EmailTemplateName =
  | 'welcome'
  | 'weekly-summary'
  | 'password-reset'
  | 'habit-reminder'
  | 'goal-deadline'
  | 'email-verification'
  | 'achievement-unlocked';

/** Arbitrary per-template data (name, urls, counts, ...). */
export type TemplateData = Record<string, unknown>;

/** Default sender used when `sendEmail` is called without an explicit `from`. */
export const DEFAULT_FROM = 'RoutineOS <no-reply@routineos.com>';

type LazyTemplateModule = () => Promise<{
  default?: ComponentType<Record<string, unknown>>;
}>;

/** Lazy registry so stubs are only loaded/parsed on first use. */
const TEMPLATE_MODULES: Record<EmailTemplateName, LazyTemplateModule> = {
  welcome: () => import('@/emails/welcome'),
  'weekly-summary': () => import('@/emails/weekly-summary'),
  'password-reset': () => import('@/emails/password-reset'),
  'habit-reminder': () => import('@/emails/habit-reminder'),
  'goal-deadline': () => import('@/emails/goal-deadline'),
  'email-verification': () => import('@/emails/email-verification'),
  'achievement-unlocked': () => import('@/emails/achievement-unlocked'),
};

/** Static subject lines, with a couple of data-driven interpolations. */
const SUBJECTS: Record<EmailTemplateName, string> = {
  welcome: 'Welcome to RoutineOS 👋',
  'weekly-summary': 'Your weekly summary from RoutineOS',
  'password-reset': 'Reset your RoutineOS password',
  'habit-reminder': 'Habit reminder from RoutineOS',
  'goal-deadline': 'Goal deadline approaching',
  'email-verification': 'Verify your email address',
  'achievement-unlocked': '🎉 Achievement unlocked!',
};

/**
 * Render a template to an HTML string.
 *
 * Tries the matching `src/emails` component first; on any failure falls back to
 * a minimal, well-formed HTML document built from `data`.
 */
export async function renderTemplate(
  name: EmailTemplateName,
  data: TemplateData = {}
): Promise<string> {
  try {
    const mod = await TEMPLATE_MODULES[name]();
    const Component = mod.default;
    if (!Component) throw new Error('Template has no default export');

    const element = createElement(Component, data);
    const html = renderToStaticMarkup(element);
    if (html.trim().length === 0) {
      throw new Error('Template rendered empty output');
    }
    return html;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'render failed';
    return renderPlainHtml(subjectFor(name, data), {
      template: name,
      reason,
      ...data,
    });
  }
}

/**
 * Plain, dependency-free HTML document builder used as the render fallback.
 */
export function renderPlainHtml(
  title: string,
  data: TemplateData = {}
): string {
  const rows = Object.entries(data)
    .map(([key, value]) => {
      const display =
        typeof value === 'string'
          ? value
          : JSON.stringify(value ?? null);
      const escaped = display
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<tr><td style="padding:6px 12px;font-weight:bold;">${key}</td><td style="padding:6px 12px;">${escaped}</td></tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f5;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
      <h1 style="font-size:20px;margin:0 0 12px;color:#111827;">${escapeHtml(title)}</h1>
      <p style="color:#44403c;line-height:1.5;">Here is the information we have for this update:</p>
      <table style="border-collapse:collapse;width:100%;">${rows}</table>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Resolve the subject line for a template. A few subjects interpolate fields
 * from `data` when present (e.g. a user's first name).
 */
export function subjectFor(
  name: EmailTemplateName,
  data: TemplateData = {}
): string {
  const firstName =
    typeof data.firstName === 'string'
      ? data.firstName.trim()
      : typeof data.userName === 'string'
        ? data.userName.trim()
        : '';
  if (name === 'weekly-summary' && firstName) {
    return `${firstName} – your weekly summary from RoutineOS`;
  }
  if (name === 'goal-deadline' && typeof data.goalTitle === 'string') {
    return `Goal deadline approaching: ${data.goalTitle}`;
  }
  if (name === 'habit-reminder' && typeof data.habitName === 'string') {
    return `Reminder: ${data.habitName}`;
  }
  return SUBJECTS[name];
}
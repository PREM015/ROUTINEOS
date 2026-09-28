/**
 * Email template rendering for the `src/emails` components.
 *
 * This module uses dynamic imports to load template functions,
 * which return HTML strings directly. It is completely safe for use
 * in the App Router server graph.
 */

import { renderPlainHtml, subjectFor, type EmailTemplateName, type TemplateData } from './html';

export type { EmailTemplateName, TemplateData };
export { renderPlainHtml, subjectFor, DEFAULT_FROM } from './html';

type LazyTemplateModule = () => Promise<{
  default?: (props: Record<string, any>) => string;
}>;

/** Lazy registry so templates are only loaded/parsed on first use. */
const TEMPLATE_MODULES: Record<EmailTemplateName, LazyTemplateModule> = {
  welcome: () => import('@/emails/welcome'),
  'weekly-summary': () => import('@/emails/weekly-summary'),
  'password-reset': () => import('@/emails/password-reset'),
  'habit-reminder': () => import('@/emails/habit-reminder'),
  'goal-deadline': () => import('@/emails/goal-deadline'),
  'email-verification': () => import('@/emails/email-verification'),
  'achievement-unlocked': () => import('@/emails/achievement-unlocked'),
};

/**
 * Render a template to an HTML string.
 *
 * Tries the matching `src/emails` component first; on any failure falls back to
 * a minimal, well-formed HTML document built from `data`, so a broken template
 * degrades the design rather than the delivery.
 */
export async function renderTemplate(
  name: EmailTemplateName,
  data: TemplateData = {},
): Promise<string> {
  try {
    const mod = await TEMPLATE_MODULES[name]();
    const renderFn = mod.default;
    if (!renderFn) throw new Error('Template has no default export');

    const html = renderFn(data);
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

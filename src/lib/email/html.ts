/**
 * Email HTML + subject helpers that depend on nothing but the standard library.
 *
 * These live apart from `./templates` on purpose. `./templates` renders the
 * `src/emails` React components with `renderToStaticMarkup` from
 * `react-dom/server`, which Turbopack rejects anywhere in the App Router server
 * graph ("You're importing a component that imports react-dom/server"). Keeping
 * the pure-string half in this module means `sender.ts` — and therefore any route
 * — can build an email without dragging `react-dom/server` into the bundle.
 *
 * The React components are still fully functional for Node-side rendering
 * (scripts, previews); they are simply not reachable from a route.
 */

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Plain, dependency-free HTML document builder.
 *
 * Doubles as the runtime fallback for `sendEmail` when no pre-rendered `html`
 * is supplied.
 */
export function renderPlainHtml(title: string, data: TemplateData = {}): string {
  const rows = Object.entries(data)
    .map(([key, value]) => {
      const display = typeof value === 'string' ? value : JSON.stringify(value ?? null);
      const escaped = display.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

/**
 * Render an email body as a readable, dependency-free HTML document built from
 * a title, an optional body and an optional call-to-action.
 *
 * Used for ad-hoc transactional mail (notification reminders) where there is no
 * dedicated React template.
 */
export function renderSimpleHtml(options: {
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  actionLabel?: string;
}): string {
  const paragraph = options.body
    ? `<p style="margin:0 0 16px;color:#44403c;line-height:1.6;">${escapeHtml(options.body)}</p>`
    : '';
  const cta = options.actionUrl
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(options.actionUrl)}" style="display:inline-block;background:#0B1120;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(options.actionLabel ?? 'Open RoutineOS')}</a></p>`
    : '';

  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>${escapeHtml(options.title)}</title></head>
  <body style="margin:0;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f5;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="font-size:20px;margin:0 0 12px;color:#111827;">${escapeHtml(options.title)}</h1>
      ${paragraph}
      ${cta}
    </div>
  </body>
</html>`;
}

/**
 * Resolve the subject line for a template. A few subjects interpolate fields
 * from `data` when present (e.g. a user's first name).
 */
export function subjectFor(name: EmailTemplateName, data: TemplateData = {}): string {
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

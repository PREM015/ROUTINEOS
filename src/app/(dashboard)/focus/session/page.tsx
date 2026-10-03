import { redirect } from 'next/navigation';

/**
 * `/focus/session` — permanently folded into `/focus`.
 *
 * This route was an 181-line page showing three things: the current session, a
 * 20-row history list, and `FocusStats`. All three now live in the `/focus`
 * workspace — the dial and companion for the session, the drawer for history, and
 * the stats panel — so the page was a second, thinner copy of a page that already
 * existed.
 *
 * It also had exactly **one inbound link in the entire codebase**
 * (`FloatingFocusBar.tsx`), so nobody was navigating here by choice.
 *
 * A redirect rather than a 404, because the URL is in other people's bookmarks and
 * in the audit trail. `permanentRedirect` sends a 308, which keeps the method and
 * body intact and tells caches this is not coming back — appropriate for a route
 * being folded in permanently rather than temporarily unavailable.
 */
export default function FocusSessionRedirect() {
  redirect('/focus');
}

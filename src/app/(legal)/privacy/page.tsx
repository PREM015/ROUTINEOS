import type { Metadata } from 'next';
import { LegalShell, Section } from '../_components/LegalShell';
import { pageMetadata, SITE_NAME } from '@/lib/seo';
import { APP_CONFIG } from '@/config/app';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy Policy',
  description: `How ${SITE_NAME} collects, uses, stores and deletes your personal data — including exactly what stays on your device and what never leaves it.`,
  path: '/privacy',
});

/**
 * Privacy Policy.
 *
 * Written against the actual schema (`prisma/schema.prisma`), the actual
 * transport adapters (`lib/email/sender.ts`, `config/app.ts`) and the actual
 * consent store (`store/consent.store.ts`) rather than generic SaaS
 * boilerplate. Every processor named below corresponds to an environment
 * variable or a dependency that really is used by the app, and every data
 * category corresponds to a real model.
 *
 * Deliberate choices worth knowing about:
 *  - It does not claim the app is "GDPR certified" or name a DPO. It cannot
 *    know the operator's legal identity; inventing one would be worse than
 *    omitting it, so the contact address comes from config instead.
 *  - It states plainly which processors receive *content* (your journal text)
 *    versus only *aggregate* data, because that is the distinction users
 *    actually care about and generic policies hide it.
 */
export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="2026-01-01"
      summary={
        <>
          <strong>The short version.</strong> {SITE_NAME} stores the data you
          enter so it can show it back to you. It is not sold, and it is not
          shared with advertisers. We never read your journal entries, goals or
          habit names. Analytics are off until you turn them on, and your
          theme and dashboard layout never leave your browser. You can export
          or delete everything from inside the app, and deleting your account
          removes your data.
        </>
      }
    >
      <Section heading="1. Who we are">
        <p>
          {SITE_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a personal
          productivity platform operated by the {SITE_NAME} project. It is
          designed for individual use: one account belongs to one person, and
          the social features are optional and off unless explicitly enabled.
        </p>
        <p>
          For any privacy question, correction or deletion request, contact{' '}
          <a href={`mailto:${APP_CONFIG.supportEmail}`}>{APP_CONFIG.supportEmail}</a>.
          That is the same address the product uses for support, and it is read
          by a human.
        </p>
      </Section>

      <Section heading="2. What we collect">
        <p>
          We collect three broad categories. Nothing is collected in the
          background, and nothing is collected from anyone other than you.
        </p>

        <h3>Account and security data</h3>
        <p>
          Your email address, an optional display name and avatar, a hashed
          password (never the password itself), your timezone, and your
          authentication state: whether your email is verified, when you last
          logged in, how many consecutive failed sign-in attempts there have
          been, and whether a temporary lockout is active. If you enable
          two-factor authentication, the secret is stored in your account
          preferences and never leaves the server.
        </p>

        <h3>Content you create</h3>
        <p>
          This is the data that makes the app useful, and it is all entered by
          you: habits and their completion logs, routine templates and the time
          you logged against them, projects, goals, milestones, tasks and their
          dependencies, sleep, mood, energy, weather and nutrition entries, focus
          sessions and breaks, daily scores, reflections, journal entries and
          their revision history, achievements, streaks, challenges, and any
          files you attach (up to {APP_CONFIG.upload.maxFileSize / 1024 / 1024} MB
          per file, types limited to{' '}
          {APP_CONFIG.upload.allowedTypes.join(', ')}).
        </p>
        <p>
          <strong>Journal entries and reflections are the most sensitive data
          in the app.</strong> They are stored per-account and are never read by
          an operator or used to build a profile.
        </p>

        <h3>Technical data we generate ourselves</h3>
        <p>
          A per-account audit log (security-relevant actions such as sign-ins,
          password changes and session revocations), an activity log (which
          records pages and features you used), and a record of which devices
          are signed in so you can revoke them. These exist to let you see and
          control access to your own account.
        </p>
      </Section>

      <Section heading="3. What stays on your device only">
        <p>
          Some preferences are stored in your browser and are never transmitted
          to us. They are readable and clearable by you at any time:
        </p>
        <ul>
          <li>
            <strong>Cookie consent choice</strong> &mdash; your accept/reject
            decision, so the banner does not reappear.
          </li>
          <li>
            <strong>Theme</strong> &mdash; light, dark or system.
          </li>
          <li>
            <strong>Dashboard widget layout</strong> &mdash; which widgets you
            have shown or hidden, per device by design.
          </li>
          <li>
            <strong>Device identifier</strong> &mdash; a random value generated
            in your browser that lets you recognise and revoke your own signed-in
            devices. It identifies the browser to you; it is not an advertising
            or cross-site identifier.
          </li>
        </ul>
        <p>
          Note that this is per-browser, not per-account. Signing out and into a
          different account on the same device does not transfer these values,
          and clearing your browser storage for this site removes all of them.
        </p>
      </Section>

      <Section heading="4. Cookies and analytics">
        <p>
          The app uses a single strictly necessary cookie to maintain your
          signed-in session. It is required to use the product and cannot be
          switched off. Everything else is opt-in and controlled by the consent
          banner, which you can reopen at any time from{' '}
          <strong>Cookie preferences</strong> in the footer.
        </p>
        <p>
          <strong>Analytics are off by default.</strong> Unless you accept the
          analytics category, no analytics script is downloaded, no measurement
          request is made, and nothing about your visit leaves your browser. If
          you do accept, we use a first-party, cookieless analytics tool that
          records aggregate page views and interactions with truncated IP
          addresses. It sets no persistent identifier, does no cross-site
          tracking, and receives no account data &mdash; never your habit names,
          journal text, goals or scores. Performance diagnostics (Speed Insights)
          are governed by the same switch.
        </p>
        <p>
          Withdrawing consent takes effect immediately: the scripts are not
          rendered again, and the stored decision is overwritten.
        </p>
      </Section>

      <Section heading="5. Processors we use">
        <p>
          We use a small number of service providers. Each one is listed with
          the data it actually receives, which is the part that matters.
        </p>
        <ul>
          <li>
            <strong>Database hosting</strong> &mdash; a managed PostgreSQL
            provider. Receives all account and content data, since that is where
            the app lives. This is the primary processor.
          </li>
          <li>
            <strong>Application hosting and CDN</strong> &mdash; the platform
            serving this site. Receives the requests needed to deliver the app.
          </li>
          <li>
            <strong>Transactional email</strong> &mdash; an email delivery
            provider, used only to send verification, password-reset and
            notification messages to the address on your account. It receives
            your email address and the content of those messages, nothing else.
            Without it configured, the app logs the message instead of sending
            it.
          </li>
          <li>
            <strong>Payments</strong> &mdash; if you subscribe, a payment
            processor handles card details. Your card number never reaches our
            servers; we store only the resulting subscription status and
            references.
          </li>
          <li>
            <strong>Single sign-on providers</strong> &mdash; if you choose to
            sign in with Google or GitHub, that provider confirms your identity
            to us and we store the resulting profile reference. We never see
            your password for those providers.
          </li>
          <li>
            <strong>AI insight provider</strong> &mdash; only if AI insights are
            enabled <em>and</em> you use the feature. Aggregated, de-identified
            statistics about your own patterns are sent to an external language
            model provider to generate written insights. Turning off AI
            insights stops this entirely. Nothing is sent if the feature is off.
          </li>
        </ul>
        <p>
          We do not sell personal data, and we do not share it for anyone
          else&rsquo;s advertising or cross-context behavioural purposes. Social
          features (challenges, connections) are disabled by default and share
          only what you explicitly publish.
        </p>
      </Section>

      <Section heading="6. How long we keep it">
        <p>
          Your content is kept while your account is active. Score, log and
          activity history is retained on a plan basis:{' '}
          {APP_CONFIG.limits.free.dataRetentionDays} days on the free plan and{' '}
          {APP_CONFIG.limits.pro.dataRetentionDays} days on Pro, while Premium
          keeps history indefinitely at your option. Deleting an individual
          record removes it immediately; deleted journal entries are recoverable
          only until you empty the deleted-items view.
        </p>
        <p>
          Sign-in sessions expire automatically after{' '}
          {APP_CONFIG.session.maxAge / 3600} hours, and you are signed out
          earlier if the app is idle for more than{' '}
          {APP_CONFIG.session.autoLogoutIdleMinutes} minutes. Password-reset and
          email-verification tokens are single-use and expire.
        </p>
        <p>
          When you delete your account, your data is removed from the active
          database. Backups roll over on a short cycle, so residual copies age
          out rather than persisting indefinitely.
        </p>
      </Section>

      <Section heading="7. How it is protected">
        <p>
          Passwords are stored as salted hashes and never in a reversible form.
          Sessions use signed, HTTP-only cookies; the session is marked{' '}
          <code>Secure</code> in production, so it is not sent over plain HTTP.
          Security-sensitive responses carry strict{' '}
          <code>Content-Security-Policy</code>, <code>X-Frame-Options</code>,{' '}
          <code>Referrer-Policy</code> and <code>Permissions-Policy</code>{' '}
          headers, and HSTS is enabled in production.
        </p>
        <p>
          Access to your data is scoped to your account on the server for every
          request &mdash; the API does not trust an account identifier supplied by
          the browser. Sign-in, password reset, registration and two-factor
          endpoints are rate limited, and repeated failures lock the account
          temporarily. Changing your password or signing out everywhere revokes
          every existing session.
        </p>
        <p>
          No system is perfect. If you discover a vulnerability, please report
          it to{' '}
          <a href={`mailto:${APP_CONFIG.supportEmail}`}>{APP_CONFIG.supportEmail}</a>{' '}
          rather than publishing it, and we will work with you on a fix.
        </p>
      </Section>

      <Section heading="8. Your rights and controls">
        <p>
          Wherever it is technically possible, the control is in the product
          rather than in an email queue:
        </p>
        <ul>
          <li>
            <strong>Export your data</strong> &mdash; request a machine-readable
            export from Settings → Data and download it when it is ready.
          </li>
          <li>
            <strong>Delete your account</strong> &mdash; from Settings → Danger
            zone, or by contacting us. This removes your account and its data.
          </li>
          <li>
            <strong>Revoke devices</strong> &mdash; see and sign out individual
            devices from Settings → Sessions.
          </li>
          <li>
            <strong>Change or delete records</strong> &mdash; per item, for
            habits, goals, tasks, journal entries and logs.
          </li>
          <li>
            <strong>Change cookie choices</strong> &mdash; reopen the consent
            preferences from the footer at any time.
          </li>
          <li>
            <strong>Correct your details</strong> &mdash; from Settings →
            Profile.
          </li>
        </ul>
        <p>
          Depending on where you live you may also have the right to access,
          correct, delete, restrict or port your personal data, to object to or
          restrict certain processing, to withdraw consent at any time, and to
          complain to your local data protection authority. Because most of
          these are self-service here, using the product or writing to us are
          both valid routes; we will not require you to use a specific one.
        </p>
      </Section>

      <Section heading="9. Children">
        <p>
          {SITE_NAME} is not directed at children and is not intended for use
          by anyone under 13 (or the minimum age in your jurisdiction). We do
          not knowingly collect data from children. If you believe a child has
          created an account, contact us and we will delete it.
        </p>
      </Section>

      <Section heading="10. International transfers">
        <p>
          Our providers may process data in countries other than your own, which
          means your data may be transferred outside the European Economic Area
          or UK. Where that happens, transfers are covered by the providers&rsquo;
          standard contractual clauses or an adequacy decision.
        </p>
      </Section>

      <Section heading="11. Changes to this policy">
        <p>
          If we change this policy in a way that affects your rights we will
          update the date at the top of this page and, for significant changes,
          notify you in the product before they take effect. Continuing to use{' '}
          {SITE_NAME} after a change means the updated policy applies from its
          effective date.
        </p>
      </Section>
    </LegalShell>
  );
}

import type { Metadata } from 'next';
import { LegalShell, Section } from '../_components/LegalShell';
import { pageMetadata, SITE_NAME } from '@/lib/seo';
import { APP_CONFIG } from '@/config/app';

export const metadata: Metadata = pageMetadata({
  title: 'Terms of Service',
  description: `The terms that apply when you use ${SITE_NAME} — your account, your data, acceptable use, and how the service is provided.`,
  path: '/terms',
});

/**
 * Terms of Service.
 *
 * Written to match the product that actually exists: the plan limits in
 * `config/app.ts`, the file-size and type restrictions in `APP_CONFIG.upload`,
 * the real session lifetime, and the self-service deletion and export paths.
 * Where a clause would otherwise be unfalsifiable boilerplate ("we may modify
 * the service at any time"), it is tied to something concrete.
 */
export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="2026-01-01"
      summary={
        <>
          <strong>The short version.</strong> {SITE_NAME} is provided as-is,
          free of charge unless you choose a paid plan. Your account and your
          data are yours &mdash; export or delete them whenever you like. Do not
          use the service to break the law or to harass anyone, and keep your
          own password to yourself. We are not liable for lost data or lost
          profit, and you are responsible for your own backups.
        </>
      }
    >
      <Section heading="1. Agreement and eligibility">
        <p>
          By creating an account or using {SITE_NAME} you agree to these terms.
          If you do not agree, do not use the service. You must be legally able
          to enter a contract where you live, and at least 13 years old (or the
          minimum age where you live). One account is for one person; sharing
          credentials defeats the session controls the product gives you.
        </p>
      </Section>

      <Section heading="2. The service">
        <p>
          {SITE_NAME} is a personal productivity platform: habit tracking,
          time-blocked routines, goals and tasks, sleep and wellness logging,
          focus sessions, journalling, and a composite daily score. It also
          offers optional AI-generated insights and optional social features
          (challenges and connections), which are disabled unless enabled.
        </p>
        <p>
          Features may be added, changed or removed. We aim to avoid removing
          something you rely on, and where a change is significant or
          destructive we will tell you first. Optional integrations with
          third-party services (calendar sync and similar) are provided as-is
          and remain subject to those providers&rsquo; own terms and uptime.
        </p>
      </Section>

      <Section heading="3. Your account">
        <p>
          You are responsible for what happens under your account, including
          keeping your password private and telling us promptly if you believe
          someone else has access. You can revoke individual devices yourself at
          any time from Settings → Sessions.
        </p>
        <p>
          You must provide accurate information and keep it current. You may not
          use the service to impersonate someone, to send unsolicited commercial
          messages, or to evade rate limits or access controls.
        </p>
      </Section>

      <Section heading="4. Your content and your rights">
        <p>
          <strong>You keep everything you create.</strong> Habits, logs, goals,
          tasks, journal entries, attachments and anything else you enter remain
          yours. We claim no ownership of it and we do not licence it beyond what
          is technically needed to run the features you use &mdash; for example,
          generating an AI insight from your own statistics.
        </p>
        <p>
          You grant us only the limited permission needed to operate the service
          for you: to store your content, process it to produce scores, streaks
          and insights, and transmit it to the sub-processors listed in the{' '}
          <a href="/privacy">Privacy Policy</a>, which you have accepted as part
          of these terms.
        </p>
        <p>
          You are responsible for having the rights to anything you upload, and
          for the lawfulness of sharing it. Do not upload content that is
          unlawful, that infringes someone else&rsquo;s rights, or that you have
          no right to store.
        </p>
      </Section>

      <Section heading="5. Plans, limits and billing">
        <p>
          The free plan includes up to{' '}
          {APP_CONFIG.limits.free.habits} habits, {APP_CONFIG.limits.free.goals}{' '}
          goals and {APP_CONFIG.limits.free.projects} projects, with{' '}
          {APP_CONFIG.limits.free.dataRetentionDays} days of history retained.{' '}
          <code>Pro</code> raises these to {APP_CONFIG.limits.pro.habits} habits,{' '}
          {APP_CONFIG.limits.pro.goals} goals and {APP_CONFIG.limits.pro.projects}{' '}
          projects with {APP_CONFIG.limits.pro.dataRetentionDays} days of history.
          <code> Premium</code> removes the caps and keeps history as long as you
          want.
        </p>
        <p>
          Paid plans are billed in advance through our payment processor. Fees
          exclude taxes where the law requires us to add them. You can cancel at
          any time; cancellation takes effect at the end of the paid period, and
          we do not refund unused time except where required by law or where we
          failed to provide the service. If a payment fails and is not resolved,
          the plan reverts to the free tier rather than deleting your data.
        </p>
        <p>
          If you downgrade, your content is kept; only the caps and retention
          window change. You can upgrade again at any time.
        </p>
      </Section>

      <Section heading="6. Acceptable use">
        <p>
          Do not use {SITE_NAME} to break the law, to infringe anyone&rsquo;s
          rights, to attack or overload the service, to probe it without
          authorisation, to circumvent plan limits, to scrape or harvest data,
          or to interfere with another person&rsquo;s use of it. Automated access
          is permitted only through the documented API, within your plan&rsquo;s
          rate limit, and with your own credentials. If you are an official
          security researcher acting in good faith, contact us first rather than
          testing without notice.
        </p>
      </Section>

      <Section heading="7. Third-party services and AI features">
        <p>
          Integrations and sign-in providers are governed by their own terms as
          well as these. {SITE_NAME} is not responsible for their content or
          availability.
        </p>
        <p>
          AI-generated insights are produced by an automated model. They are
          suggestions, not professional advice, and they can be wrong. They
          should not be relied on for medical, psychological, legal or financial
          decisions. They are generated from your own data, and are disabled
          entirely if the feature is switched off.
        </p>
      </Section>

      <Section heading="8. Backups and availability">
        <p>
          The service is provided on an &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; basis. We do not guarantee a specific uptime
          percentage, and we may suspend the service for maintenance or in an
          emergency. We will not delete your content without notice except where
          required by law or for abuse.
        </p>
        <p>
          <strong>Keep your own backups.</strong> The export feature exists so
          you can take a copy, and we recommend you do so before any bulk change.
          We are not responsible for lost data.
        </p>
      </Section>

      <Section heading="9. Termination">
        <p>
          You can delete your account at any time from Settings → Danger zone,
          and doing so ends this agreement and removes your data. We may suspend
          or terminate an account that breaches these terms, is inactive for a
          long period, or creates a security risk &mdash; normally with notice and
          an opportunity to fix the problem. On termination your content is
          deleted, except where retention is required by law.
        </p>
      </Section>

      <Section heading="10. Disclaimers and liability">
        <p>
          To the fullest extent permitted by law, {SITE_NAME} is provided
          &ldquo;as is&rdquo; without warranties of any kind, express or implied,
          including fitness for a particular purpose. The product is a
          self-tracking tool: its scores, streaks and insights are informational
          and are not medical, psychological, legal or financial advice. Consult
          a qualified professional where it matters.
        </p>
        <p>
          We are not liable for indirect, incidental, special or consequential
          loss, or for lost profits, revenue or data, arising from your use of
          the service. Nothing here excludes liability that cannot lawfully be
          excluded, such as for death or personal injury caused by negligence,
          or for fraud.
        </p>
      </Section>

      <Section heading="11. Indemnity">
        <p>
          You agree to indemnify us against claims arising from your content, your
          use of the service in breach of these terms, or your violation of
          someone else&rsquo;s rights.
        </p>
      </Section>

      <Section heading="12. Changes to these terms">
        <p>
          We may update these terms. The date at the top of this page always
          reflects the current version. For changes that materially reduce your
          rights we will give you notice in the product before they take effect.
          Continuing to use {SITE_NAME} after that notice means you accept the
          updated terms.
        </p>
      </Section>

      <Section heading="13. Governing law">
        <p>
          These terms are governed by the laws that apply where the operator is
          established, without regard to conflict-of-law rules. Nothing in them
          removes rights you have under the mandatory consumer law of your
          country of residence. If any provision is unenforceable, the rest
          stands.
        </p>
      </Section>
    </LegalShell>
  );
}

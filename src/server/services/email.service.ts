import { createConnection } from 'node:net';
import type { Achievement, Goal, Habit } from '@prisma/client';

/**
 * Email Service
 * Sends transactional emails with a minimal SMTP client (no external deps).
 * Falls back to a dev log when no SMTP host is configured.
 */

export interface EmailSendResult {
  success: boolean;
  queued: boolean;
}

export interface WeeklySummaryData {
  weekStart?: string;
  completedHabits?: number;
  completedGoals?: number;
  averageScore?: number;
  streak?: number;
}

interface SmtpTransportOptions {
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXTAUTH_URL ??
  'http://localhost:3000';
const EMAIL_FROM =
  process.env.EMAIL_FROM ?? 'noreply@routineos.com';

/**
 * Escape untrusted values for safe embedding in HTML emails
 */
function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (char) => entities[char] ?? char);
}

/**
 * Resolve SMTP configuration from environment variables
 */
function resolveSmtpConfig(): {
  host?: string;
  port: number;
  user?: string;
  password?: string;
} {
  const host =
    process.env.EMAIL_SERVER_HOST ??
    process.env.EMAIL_HOST ??
    process.env.SMTP_HOST;
  const rawPort =
    process.env.EMAIL_SERVER_PORT ??
    process.env.EMAIL_PORT ??
    process.env.SMTP_PORT ??
    '587';
  const port = Number.parseInt(rawPort, 10);
  return {
    host: host || undefined,
    port: Number.isFinite(port) ? port : 587,
    user: process.env.EMAIL_SERVER_USER ?? process.env.SMTP_USER,
    password:
      process.env.EMAIL_SERVER_PASSWORD ?? process.env.SMTP_PASS,
  };
}

/**
 * Send a single mail through a minimal state-machine SMTP client
 */
function sendSmtpEmail(options: SmtpTransportOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(
      { host: options.host, port: options.port, timeout: 15000 },
      () => {
        // connection handler
      }
    );

    const message = [
      `From: ${options.from}`,
      `To: ${options.to}`,
      `Subject: ${options.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      options.html,
    ].join('\r\n');

    // Steps: 0=banner, 1=EHLO, 2=AUTH, 3=MAIL FROM, 4=RCPT TO,
    //        5=DATA, 6=content, 7=QUIT/done
    let step = 0;
    let buffer = '';

    const fail = (messageText: string): void => {
      socket.destroy();
      reject(new Error(messageText));
    };

    socket.setEncoding('utf8');

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');

      while (buffer.includes('\r\n')) {
        const lineEnd = buffer.indexOf('\r\n');
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        const code = line.slice(0, 3);

        if (step === 0 && code === '220') {
          step = 1;
          socket.write(`EHLO ${options.host}\r\n`);
          continue;
        }

        if (step === 1 && code === '250') {
          if (line.startsWith('250-')) {
            continue;
          }
          if (options.user && options.password) {
            const credentials = Buffer.from(
              `\0${options.user}\0${options.password}`,
              'utf8'
            ).toString('base64');
            socket.write(`AUTH PLAIN ${credentials}\r\n`);
            step = 2;
          } else {
            socket.write(`MAIL FROM: <${options.from}>\r\n`);
            step = 3;
          }
          continue;
        }

        if (step === 2 && code === '235') {
          socket.write(`MAIL FROM: <${options.from}>\r\n`);
          step = 3;
          continue;
        }

        if (step === 3 && code === '250') {
          socket.write(`RCPT TO: <${options.to}>\r\n`);
          step = 4;
          continue;
        }

        if (step === 4 && code === '250') {
          socket.write('DATA\r\n');
          step = 5;
          continue;
        }

        if (step === 5 && code === '354') {
          socket.write(`${message}\r\n.\r\n`);
          step = 6;
          continue;
        }

        if (step === 6 && code === '250') {
          socket.write('QUIT\r\n');
          step = 7;
          continue;
        }

        if (step === 7) {
          socket.end();
          resolve();
          continue;
        }

        if (/^[45]\d\d/.test(code)) {
          fail(`SMTP error: ${line}`);
        }
      }
    });

    socket.on('error', (error) => fail(error.message));
    socket.on('timeout', () => fail('SMTP connection timed out'));
  });
}

/**
 * Wrap email HTML in a consistent shell layout
 */
function renderShell(title: string, bodyHtml: string): string {
  return [
    '<!DOCTYPE html>',
    '<html>',
    '<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">',
    '<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">',
    '<div style="padding:24px 32px;background:#0f172a;color:#ffffff;font-size:18px;font-weight:600;">RoutineOS</div>',
    '<div style="padding:32px;">',
    `<h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${escapeHtml(title)}</h1>`,
    bodyHtml,
    '</div>',
    '<div style="padding:16px 32px;background:#f9fafb;color:#6b7280;font-size:12px;">',
    'This email was sent by RoutineOS.',
    '</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('');
}

/**
 * Build a call-to-action button
 */
function renderButton(href: string, label: string): string {
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">',
    '<tr>',
    '<td style="border-radius:8px;background:#2563eb;">',
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(label)}</a>`,
    '</td>',
    '</tr>',
    '</table>',
  ].join('');
}

export class EmailService {
  /**
   * Send a plain HTML email to a single recipient
   */
  async sendEmail(
    to: string,
    subject: string,
    bodyHtml: string
  ): Promise<EmailSendResult> {
    if (!to || !to.includes('@')) {
      return { success: false, queued: false };
    }

    const { host, port, user, password } = resolveSmtpConfig();

    if (!host) {
      console.warn(
        `[email] SMTP not configured; would send "${subject}" to ${to}`
      );
      return { success: true, queued: false };
    }

    try {
      await sendSmtpEmail({
        host,
        port,
        user,
        password,
        from: EMAIL_FROM,
        to,
        subject,
        html: renderShell(subject, bodyHtml),
      });
      return { success: true, queued: true };
    } catch (error) {
      console.error(`[email] Failed to send "${subject}" to ${to}:`, error);
      return { success: false, queued: false };
    }
  }

  /**
   * Send an email verification link
   */
  async sendVerificationEmail(
    to: string,
    token: string
  ): Promise<EmailSendResult> {
    const link = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
    const body = [
      '<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">',
      'Welcome to RoutineOS! Please confirm your email address to activate your account.',
      '</p>',
      renderButton(link, 'Verify email'),
      `<p style="margin:0;color:#9ca3af;font-size:12px;">Or paste this link into your browser: ${escapeHtml(link)}</p>`,
    ].join('');
    return this.sendEmail(to, 'Verify your email', body);
  }

  /**
   * Send a password reset link
   */
  async sendPasswordReset(
    to: string,
    token: string
  ): Promise<EmailSendResult> {
    const link = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    const body = [
      '<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">',
      'We received a request to reset your password. This link expires in one hour.',
      '</p>',
      renderButton(link, 'Reset password'),
      `<p style="margin:0;color:#9ca3af;font-size:12px;">Or paste this link into your browser: ${escapeHtml(link)}</p>`,
    ].join('');
    return this.sendEmail(to, 'Reset your password', body);
  }

  /**
   * Send a welcome email after signup
   */
  async sendWelcome(
    to: string,
    name: string
  ): Promise<EmailSendResult> {
    const displayName = name && name.trim().length > 0 ? name.trim() : 'there';
    const body = [
      `<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Hey ${escapeHtml(displayName)} — your RoutineOS account is ready.</p>`,
      '<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Start building habits, planning your day, and tracking your goals.</p>',
      renderButton(`${APP_URL}/dashboard`, 'Open dashboard'),
    ].join('');
    return this.sendEmail(to, 'Welcome to RoutineOS', body);
  }

  /**
   * Send a weekly progress summary
   */
  async sendWeeklySummary(
    to: string,
    data: WeeklySummaryData
  ): Promise<EmailSendResult> {
    const weekLabel = data.weekStart ? ` for ${data.weekStart}` : '';
    const rows = [
      ['Habits completed', data.completedHabits],
      ['Goals completed', data.completedGoals],
      ['Average score', data.averageScore],
      ['Current streak', data.streak],
    ];
    const list = rows
      .filter(([label, value]) => value !== undefined)
      .map(
        ([label, value]) =>
          `<li style="margin:4px 0;"><span style="color:#6b7280;">${escapeHtml(label as string)}:</span> <strong style="color:#111827;">${escapeHtml(String(value))}</strong></li>`
      )
      .join('');
    const body = [
      `<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Here is your weekly summary${escapeHtml(weekLabel)}.</p>`,
      `<ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:14px;">${list}</ul>`,
      renderButton(`${APP_URL}/analytics`, 'View analytics'),
    ].join('');
    return this.sendEmail(to, 'Your weekly summary', body);
  }

  /**
   * Send a habit reminder
   */
  async sendHabitReminder(
    to: string,
    habit: Pick<Habit, 'id' | 'name'>,
    date: string
  ): Promise<EmailSendResult> {
    const body = [
      `<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Time to work on <strong>${escapeHtml(habit.name)}</strong> for ${escapeHtml(date)}.</p>`,
      renderButton(`${APP_URL}/habits/${habit.id}`, 'Open habit'),
    ].join('');
    return this.sendEmail(to, `Reminder: ${habit.name}`, body);
  }

  /**
   * Send a goal deadline warning
   */
  async sendGoalDeadline(
    to: string,
    goal: Pick<Goal, 'id' | 'title' | 'endDate'>
  ): Promise<EmailSendResult> {
    const dueDate = goal.endDate
      ? goal.endDate.toISOString().split('T')[0] ?? ''
      : '';
    const body = [
      `<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Your goal <strong>${escapeHtml(goal.title)}</strong> is due ${escapeHtml(dueDate)}.</p>`,
      renderButton(`${APP_URL}/goals/${goal.id}`, 'View goal'),
    ].join('');
    return this.sendEmail(to, `Goal due: ${goal.title}`, body);
  }

  /**
   * Send an achievement unlocked notification
   */
  async sendAchievementUnlocked(
    to: string,
    achievement: Pick<Achievement, 'id' | 'title'>
  ): Promise<EmailSendResult> {
    const body = [
      `<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Congratulations — you unlocked <strong>${escapeHtml(achievement.title)}</strong>.</p>`,
      renderButton(`${APP_URL}/achievements/${achievement.id}`, 'View achievement'),
    ].join('');
    return this.sendEmail(to, `Achievement unlocked: ${achievement.title}`, body);
  }
}

export const emailService = new EmailService();
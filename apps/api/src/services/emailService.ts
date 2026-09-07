import 'dotenv/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { escapeHtml } from '../views/webAuthPages.js';

// Configuration helpers
function getEmailConfig() {
  return {
    resendApiKey: process.env.RESEND_API_KEY || '',
    brevoApiKey: process.env.BREVO_API_KEY || '',
    emailFrom: process.env.EMAIL_FROM || '',
    gmailUser: process.env.GMAIL_USER || '',
    gmailPass: process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || '',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    smtpSecure: process.env.SMTP_SECURE === 'true',
    allowRawPreviews: process.env.ALLOW_INSECURE_PREVIEWS === 'true',
    isProduction: process.env.NODE_ENV === 'production',
    isRender: process.env.RENDER === 'true',
  };
}

/**
 * Resolves the public base URL of the API server for verification and reset links.
 * Checks APP_PUBLIC_URL, API_PUBLIC_URL, RENDER_EXTERNAL_URL, and incoming request headers.
 */
export function getPublicBaseUrl(req?: any): string {
  if (process.env.APP_PUBLIC_URL) {
    return process.env.APP_PUBLIC_URL.replace(/\/+$/, '');
  }
  if (process.env.API_PUBLIC_URL) {
    return process.env.API_PUBLIC_URL.replace(/\/+$/, '');
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  }
  if (req && typeof req.get === 'function') {
    const rawHost = req.get('host');
    if (rawHost) {
      const proto =
        req.get('x-forwarded-proto') || (req.protocol === 'https' ? 'https' : 'http');
      return `${proto}://${rawHost}`.replace(/\/+$/, '');
    }
  }
  return `http://localhost:${process.env.PORT || 4000}`;
}

function redactEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const maskedUser = user.length <= 2 ? `${user[0] || ''}***` : `${user.slice(0, 2)}***`;
  return `${maskedUser}@${domain}`;
}

function redactUrlToken(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    if (parsed.searchParams.has('token')) {
      const token = parsed.searchParams.get('token') || '';
      const prefix = token.slice(0, 8);
      parsed.searchParams.set('token', `${prefix}...[REDACTED]`);
      return parsed.toString();
    }
  } catch {
    // fallback
  }
  return urlStr.replace(/(token=)([^&]+)/, '$1[REDACTED]');
}

// Cached SMTP transporter
let cachedTransporter: Transporter | null = null;
let cachedTransporterKey = '';

function getSmtpTransporter(): Transporter | null {
  const config = getEmailConfig();
  const currentKey = `${config.smtpHost}:${config.smtpPort}:${config.smtpUser}:${config.gmailUser}:${config.gmailPass}`;

  if (cachedTransporter && cachedTransporterKey === currentKey) {
    return cachedTransporter;
  }

  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    cachedTransporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure || config.smtpPort === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    cachedTransporterKey = currentKey;
    console.log(`📧 Custom SMTP Nodemailer initialized for: ${config.smtpHost}:${config.smtpPort}`);
    return cachedTransporter;
  }

  if (config.gmailUser && config.gmailPass) {
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.gmailUser,
        pass: config.gmailPass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    cachedTransporterKey = currentKey;
    console.log(`📧 Gmail Nodemailer initialized for: ${config.gmailUser}`);
    return cachedTransporter;
  }

  return null;
}

// Log startup diagnostics
const initialConfig = getEmailConfig();
if (initialConfig.brevoApiKey) {
  console.log('📧 Email provider configured: Brevo HTTP API (HTTPS port 443)');
} else if (initialConfig.resendApiKey) {
  console.log('📧 Email provider configured: Resend HTTP API (HTTPS port 443)');
} else if (initialConfig.gmailUser && initialConfig.gmailPass) {
  if (initialConfig.isRender) {
    console.warn(`
⚠️ [EMAIL SERVICE WARNING - RENDER DETECTED]
You have configured Gmail SMTP on Render. Render free-tier blocks outbound traffic on SMTP ports (25, 465, 587).
If emails fail with a connection timeout (ETIMEDOUT):
  1. Add BREVO_API_KEY to your Render Environment Variables (works over HTTPS port 443 to any email).
  2. Or add RESEND_API_KEY (requires verified custom domain to send to any email).
  3. Or upgrade Render to a paid instance to unblock SMTP ports.
`);
  } else {
    console.log(`📧 Email provider configured: Gmail Nodemailer (${initialConfig.gmailUser})`);
  }
} else {
  console.warn(
    '⚠️ No email provider configured (BREVO_API_KEY, RESEND_API_KEY, or GMAIL_USER & GMAIL_APP_PASSWORD). Emails will be logged to console.'
  );
}

interface SendEmailParams {
  toEmail: string;
  subject: string;
  htmlContent: string;
  fromName: string;
  previewUrl?: string;
}

/**
 * Universal email dispatcher:
 * 1. Brevo HTTP REST API (Recommended: HTTPS port 443, sends to any recipient without domain lock)
 * 2. Resend HTTP REST API (HTTPS port 443, requires custom domain for non-admin recipients)
 * 3. Nodemailer (Custom SMTP or Gmail SMTP)
 * 4. Development Console Fallback
 */
async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; previewUrl?: string; error?: string }> {
  const config = getEmailConfig();
  const { toEmail, subject, htmlContent, fromName, previewUrl } = params;

  // 1. Try Brevo HTTP API (Outbound HTTPS port 443, immune to SMTP blocking)
  if (config.brevoApiKey) {
    try {
      let senderEmail = config.emailFrom || config.gmailUser || 'amansaluja017@gmail.com';
      let senderName = fromName;

      // Extract email address and optional display name if formatted as "Name <email@domain.com>"
      const emailMatch = senderEmail.match(/^(?:(.*?)<)?([^<>\s]+@[^<>\s]+)>?$/);
      if (emailMatch) {
        if (emailMatch[1]?.trim()) {
          senderName = emailMatch[1].trim().replace(/^["']|["']$/g, '');
        }
        senderEmail = emailMatch[2].trim();
      }

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': config.brevoApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: toEmail }],
          subject,
          htmlContent,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`❌ Failed to send email via Brevo (${response.status}):`, errorBody);
        return { success: false, error: `Brevo error: ${response.status} ${errorBody}` };
      }

      console.log(`✉️ Email successfully sent via Brevo to ${toEmail}`);
      return { success: true };
    } catch (err: any) {
      console.error('❌ Brevo HTTP request exception:', err?.message || err);
      return { success: false, error: err?.message || 'Brevo network error' };
    }
  }

  // 2. Try Resend HTTP API (Outbound HTTPS port 443, immune to SMTP blocking)
  if (config.resendApiKey) {
    try {
      const defaultFrom = config.emailFrom || `${fromName} <onboarding@resend.dev>`;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: defaultFrom,
          to: [toEmail],
          subject,
          htmlContent,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`❌ Failed to send email via Resend (${response.status}):`, errorBody);
        return { success: false, error: `Resend error: ${response.status} ${errorBody}` };
      }

      console.log(`✉️ Email successfully sent via Resend to ${toEmail}`);
      return { success: true };
    } catch (err: any) {
      console.error('❌ Resend HTTP request exception:', err?.message || err);
      return { success: false, error: err?.message || 'Resend network error' };
    }
  }

  // 3. Try Nodemailer (SMTP / Gmail)
  const transporter = getSmtpTransporter();
  if (transporter) {
    try {
      const fromAddress = config.emailFrom || `"${fromName}" <${config.smtpUser || config.gmailUser}>`;
      await transporter.sendMail({
        from: fromAddress,
        to: toEmail,
        subject,
        html: htmlContent,
      });
      console.log(`✉️ Email sent via SMTP to ${toEmail}`);
      return { success: true };
    } catch (err: any) {
      const isTimeout =
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ECONNREFUSED' ||
        err?.message?.includes('timeout') ||
        err?.command === 'CONN';

      if (isTimeout && config.isRender) {
        console.error(`
❌ [SMTP CONNECTION TIMEOUT ON RENDER]
Render free-tier blocks outbound traffic to SMTP ports (25, 465, 587).
The connection to the mail server timed out.
To resolve this:
  1. Create a free account on https://resend.com
  2. Add RESEND_API_KEY=re_... in your Render Dashboard -> Environment Variables
  3. Redeploy. Emails will be delivered instantly over HTTPS (port 443).
`);
      } else {
        console.error('❌ Failed to send email via SMTP:', err?.message || err);
      }
      return { success: false, error: err?.message || 'SMTP error' };
    }
  }

  // 4. Console Fallback (When no transport or API key is configured)
  const displayEmail = config.allowRawPreviews ? toEmail : redactEmail(toEmail);
  const displayUrl = previewUrl ? (config.allowRawPreviews ? previewUrl : redactUrlToken(previewUrl)) : '';

  if (config.isProduction) {
    console.warn(`
⚠️ [EMAIL NOT DELIVERED - NO EMAIL SERVICE CONFIGURED IN PRODUCTION]
Attempted to send to: ${displayEmail}
Subject: ${subject}
Please configure RESEND_API_KEY or GMAIL_USER & GMAIL_APP_PASSWORD in your production environment variables.
`);
  }

  console.log('\n====================== [EMAIL PREVIEW] ======================');
  console.log(`To: ${displayEmail}`);
  console.log(`Subject: ${subject}`);
  if (displayUrl) {
    console.log(`Action URL: ${displayUrl}`);
  }
  console.log('=============================================================\n');

  return { success: true, previewUrl };
}

/**
 * Send an email verification message containing the token link to verify a new email address
 */
export async function sendEmailVerificationEmail(
  toEmail: string,
  verifyUrl: string
): Promise<{ success: boolean; previewUrl?: string; error?: string }> {
  const subject = 'Verify your new Env Vault account email';
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0c; color: #ffffff; margin: 0; padding: 30px 15px; }
          .container { max-width: 540px; margin: 0 auto; background-color: #121316; border: 1px solid #27272a; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          .badge { display: inline-block; padding: 4px 10px; background-color: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; color: #10b981; font-size: 11px; font-weight: 800; letter-spacing: 1px; margin-bottom: 20px; }
          h1 { color: #ffffff; font-size: 22px; font-weight: 800; margin-top: 0; margin-bottom: 12px; }
          p { color: #a1a1aa; font-size: 14px; line-height: 22px; margin-bottom: 24px; }
          .btn { display: inline-block; background: #10b981; color: #000000 !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 800; font-size: 14px; letter-spacing: 0.5px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); }
          .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #27272a; font-size: 12px; color: #71717a; }
          .raw-link { word-break: break-all; color: #10b981; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="badge">ENV VAULT • SECURITY</div>
          <h1>Verify Your New Email Address</h1>
          <p>
            You requested to change your account email on Env Vault to <strong>${toEmail}</strong>.<br/>
            Please click the button below to confirm this change and activate your new email address.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}" class="btn" target="_blank">Verify Email Address</a>
          </div>
          <p style="font-size: 12px; color: #71717a;">
            If the button doesn't work, copy and paste this verification URL into your browser:
            <br/>
            <a href="${verifyUrl}" class="raw-link">${verifyUrl}</a>
          </p>
          <div class="footer">
            If you did not initiate this request, your account is secure and you can safely ignore this email.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    toEmail,
    subject,
    htmlContent,
    fromName: 'Env Vault Security',
    previewUrl: verifyUrl,
  });
}

/**
 * Send a password reset email with the secure passwordResetToken
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string
): Promise<{ success: boolean; previewUrl?: string; error?: string }> {
  const subject = 'Reset your Env Vault account password';
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0c; color: #ffffff; margin: 0; padding: 30px 15px; }
          .container { max-width: 540px; margin: 0 auto; background-color: #121316; border: 1px solid #27272a; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          .badge { display: inline-block; padding: 4px 10px; background-color: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 20px; color: #06b6d4; font-size: 11px; font-weight: 800; letter-spacing: 1px; margin-bottom: 20px; }
          h1 { color: #ffffff; font-size: 22px; font-weight: 800; margin-top: 0; margin-bottom: 12px; }
          p { color: #a1a1aa; font-size: 14px; line-height: 22px; margin-bottom: 24px; }
          .btn { display: inline-block; background: #06b6d4; color: #000000 !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 800; font-size: 14px; letter-spacing: 0.5px; box-shadow: 0 4px 15px rgba(6, 182, 212, 0.3); }
          .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #27272a; font-size: 12px; color: #71717a; }
          .raw-link { word-break: break-all; color: #06b6d4; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="badge">ENV VAULT • ACCOUNT RECOVERY</div>
          <h1>Password Reset Request</h1>
          <p>
            We received a request to reset the password for your Env Vault account.
            Click the button below to open the secure web portal and enter your new password.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" class="btn" target="_blank">Reset Password</a>
          </div>
          <p style="font-size: 12px; color: #71717a;">
            This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
            <br/><br/>
            Direct Link: <a href="${resetUrl}" class="raw-link">${resetUrl}</a>
          </p>
          <div class="footer">
            Env Vault • Secure Environment & Secret Storage
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    toEmail,
    subject,
    htmlContent,
    fromName: 'Env Vault Security',
    previewUrl: resetUrl,
  });
}

/**
 * Send an email invitation to join a workspace team with a 1-hour expiration token
 */
export async function sendTeamInvitationEmail(
  toEmail: string,
  inviteUrl: string,
  teamName: string,
  workspaceName: string,
  inviterName?: string
): Promise<{ success: boolean; previewUrl?: string; error?: string }> {
  const safeTeamName = escapeHtml(teamName);
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeInviterName = inviterName ? escapeHtml(inviterName) : undefined;

  const subject = `${safeInviterName ? `${safeInviterName} invited you` : "You've been invited"} to join ${safeTeamName} on Env Vault`;
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0c; color: #ffffff; margin: 0; padding: 30px 15px; }
          .container { max-width: 540px; margin: 0 auto; background-color: #121316; border: 1px solid #27272a; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          .badge { display: inline-block; padding: 4px 10px; background-color: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 20px; color: #818cf8; font-size: 11px; font-weight: 800; letter-spacing: 1px; margin-bottom: 20px; }
          h1 { color: #ffffff; font-size: 22px; font-weight: 800; margin-top: 0; margin-bottom: 12px; }
          p { color: #a1a1aa; font-size: 14px; line-height: 22px; margin-bottom: 24px; }
          .team-box { background: rgba(255, 255, 255, 0.04); border: 1px solid #27272a; border-radius: 12px; padding: 16px; margin-bottom: 24px; }
          .team-name { color: #06b6d4; font-weight: 700; font-size: 16px; margin-bottom: 4px; }
          .ws-name { color: #71717a; font-size: 13px; }
          .btn { display: inline-block; background: #10b981; color: #000000 !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 800; font-size: 14px; letter-spacing: 0.5px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); }
          .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #27272a; font-size: 12px; color: #71717a; }
          .raw-link { word-break: break-all; color: #10b981; font-size: 12px; }
          .expiry-note { color: #f59e0b; font-size: 12px; font-weight: 600; margin-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="badge">ENV VAULT • TEAM INVITATION</div>
          <h1>Join ${safeTeamName}</h1>
          <p>
            ${safeInviterName ? `<strong>${safeInviterName}</strong> has` : 'You have been'} invited to collaborate on secrets and environment variables in Env Vault.
          </p>
          <div class="team-box">
            <div class="team-name">📁 ${safeTeamName}</div>
            <div class="ws-name">🏢 Workspace: ${safeWorkspaceName}</div>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" class="btn" target="_blank">Accept Invitation</a>
          </div>
          <p class="expiry-note">
            ⏱️ This invitation link expires in <strong>1 hour</strong>.
          </p>
          <p style="font-size: 12px; color: #71717a;">
            Direct Link: <a href="${inviteUrl}" class="raw-link">${inviteUrl}</a>
          </p>
          <div class="footer">
            If you did not expect this invitation, you can safely disregard this email.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    toEmail,
    subject,
    htmlContent,
    fromName: 'Env Vault',
    previewUrl: inviteUrl,
  });
}

/**
 * Diagnostic helper to test email delivery
 */
export async function testEmailDelivery(testToEmail: string): Promise<{ success: boolean; provider: string; error?: string }> {
  const config = getEmailConfig();
  let provider = 'Console Preview';
  if (config.brevoApiKey) provider = 'Brevo (HTTP/443)';
  else if (config.resendApiKey) provider = 'Resend (HTTP/443)';
  else if (config.smtpHost) provider = `Custom SMTP (${config.smtpHost}:${config.smtpPort})`;
  else if (config.gmailUser) provider = `Gmail SMTP (${config.gmailUser})`;

  const result = await sendEmail({
    toEmail: testToEmail,
    subject: 'Env Vault Email Delivery Test',
    htmlContent: '<p>This is a test email from Env Vault to confirm production email delivery.</p>',
    fromName: 'Env Vault System',
  });

  return {
    success: result.success,
    provider,
    error: result.error,
  };
}

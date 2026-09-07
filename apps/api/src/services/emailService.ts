import nodemailer, { type Transporter } from 'nodemailer';
import { escapeHtml } from '../views/webAuthPages.js';

const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || '';

const allowRawPreviews = process.env.ALLOW_INSECURE_PREVIEWS === 'true';

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

let transporter: Transporter | null = null;

if (GMAIL_USER && GMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS,
    },
  });
  console.log(`📧 Gmail Nodemailer initialized for: ${GMAIL_USER}`);
} else {
  console.warn(
    '⚠️ GMAIL_USER and GMAIL_APP_PASSWORD not detected in environment. Emails will be logged to the console.'
  );
}

/**
 * Send an email verification message containing the token link to verify a new email address
 */
export async function sendEmailVerificationEmail(
  toEmail: string,
  verifyUrl: string
): Promise<{ success: boolean; previewUrl?: string }> {
  const subject = 'Verify your new Tubo account email';
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
          <div class="badge">TUBO VAULT • SECURITY</div>
          <h1>Verify Your New Email Address</h1>
          <p>
            You requested to change your account email on Tubo Vault to <strong>${toEmail}</strong>.<br/>
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

  if (transporter && GMAIL_USER) {
    try {
      await transporter.sendMail({
        from: `"Tubo Vault Security" <${GMAIL_USER}>`,
        to: toEmail,
        subject,
        html: htmlContent,
      });
      console.log(`✉️ Email verification sent via Gmail to ${toEmail}`);
      return { success: true };
    } catch (err: any) {
      console.error('❌ Failed to send email verification via Gmail:', err?.message || err);
      return { success: false };
    }
  }

  // Console fallback for testing & local development (when no transport is configured)
  const displayEmail = allowRawPreviews ? toEmail : redactEmail(toEmail);
  const displayUrl = allowRawPreviews ? verifyUrl : redactUrlToken(verifyUrl);

  console.log('\n================== [EMAIL VERIFICATION PREVIEW] ==================');
  console.log(`To: ${displayEmail}`);
  console.log(`Subject: ${subject}`);
  console.log(`Verification URL: ${displayUrl}`);
  console.log('===================================================================\n');

  return { success: true, previewUrl: verifyUrl };
}

/**
 * Send a password reset email with the secure passwordResetToken
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string
): Promise<{ success: boolean; previewUrl?: string }> {
  const subject = 'Reset your Tubo account password';
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
          <div class="badge">TUBO VAULT • ACCOUNT RECOVERY</div>
          <h1>Password Reset Request</h1>
          <p>
            We received a request to reset the password for your Tubo Vault account.
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
            Tubo Vault • Secure Environment & Secret Storage
          </div>
        </div>
      </body>
    </html>
  `;

  if (transporter && GMAIL_USER) {
    try {
      await transporter.sendMail({
        from: `"Tubo Vault Security" <${GMAIL_USER}>`,
        to: toEmail,
        subject,
        html: htmlContent,
      });
      console.log(`✉️ Password reset email sent via Gmail to ${toEmail}`);
      return { success: true };
    } catch (err: any) {
      console.error('❌ Failed to send password reset via Gmail:', err?.message || err);
      return { success: false };
    }
  }

  // Console fallback for testing & local development (when no transport is configured)
  const displayEmail = allowRawPreviews ? toEmail : redactEmail(toEmail);
  const displayUrl = allowRawPreviews ? resetUrl : redactUrlToken(resetUrl);

  console.log('\n=================== [PASSWORD RESET PREVIEW] ===================');
  console.log(`To: ${displayEmail}`);
  console.log(`Subject: ${subject}`);
  console.log(`Reset Portal URL: ${displayUrl}`);
  console.log('=================================================================\n');

  return { success: true, previewUrl: resetUrl };
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
): Promise<{ success: boolean; previewUrl?: string }> {
  const safeTeamName = escapeHtml(teamName);
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeInviterName = inviterName ? escapeHtml(inviterName) : undefined;

  const subject = `${safeInviterName ? `${safeInviterName} invited you` : "You've been invited"} to join ${safeTeamName} on Tubo Vault`;
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
          <div class="badge">TUBO VAULT • TEAM INVITATION</div>
          <h1>Join ${safeTeamName}</h1>
          <p>
            ${safeInviterName ? `<strong>${safeInviterName}</strong> has` : 'You have been'} invited to collaborate on secrets and environment variables in Tubo Vault.
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

  if (transporter && GMAIL_USER) {
    try {
      await transporter.sendMail({
        from: `"Tubo Vault" <${GMAIL_USER}>`,
        to: toEmail,
        subject,
        html: htmlContent,
      });
      console.log(`✉️ Team invitation sent via Gmail to ${toEmail}`);
      return { success: true };
    } catch (err: any) {
      console.error('❌ Failed to send team invitation via Gmail:', err?.message || err);
      return { success: false };
    }
  }

  // Console fallback for local development (when no transport is configured)
  const displayEmail = allowRawPreviews ? toEmail : redactEmail(toEmail);
  const displayUrl = allowRawPreviews ? inviteUrl : redactUrlToken(inviteUrl);

  console.log('\n=================== [TEAM INVITATION PREVIEW] ===================');
  console.log(`To: ${displayEmail}`);
  console.log(`Subject: ${subject}`);
  console.log(`Team: ${safeTeamName} | Workspace: ${safeWorkspaceName}`);
  console.log(`Invite URL: ${displayUrl}`);
  console.log('=================================================================\n');

  return { success: true, previewUrl: inviteUrl };
}

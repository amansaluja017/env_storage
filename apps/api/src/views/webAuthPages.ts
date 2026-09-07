/**
 * HTML Templates for Web Verification and Password Reset Portal
 */

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmailVerifiedPage(success: boolean, emailOrError: string): string {
  const safeEmailOrError = escapeHtml(emailOrError);
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${success ? 'Email Verified' : 'Verification Failed'} - Tubo Vault</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #000000;
            color: #ffffff;
            margin: 0;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .card {
            background-color: #121316;
            border: 1px solid #27272a;
            border-radius: 20px;
            padding: 40px 30px;
            max-width: 460px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 50px rgba(0,0,0,0.7);
          }
          .icon-box {
            width: 64px;
            height: 64px;
            border-radius: 20px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            background: ${success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'};
            border: 1px solid ${success ? '#10b981' : '#ef4444'};
          }
          h1 {
            font-size: 24px;
            font-weight: 800;
            margin: 0 0 10px;
            color: #ffffff;
          }
          p {
            color: #a1a1aa;
            font-size: 15px;
            line-height: 24px;
            margin: 0 0 28px;
          }
          .highlight {
            color: #10b981;
            font-weight: 700;
          }
          .btn {
            display: inline-block;
            background: #10b981;
            color: #000000;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 12px;
            font-weight: 800;
            font-size: 15px;
            width: 100%;
            transition: opacity 0.2s;
          }
          .btn:hover { opacity: 0.9; }
          .footer-text {
            margin-top: 20px;
            font-size: 12px;
            color: #71717a;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon-box">
            ${success ? '✅' : '❌'}
          </div>
          <h1>${success ? 'Email Verified!' : 'Verification Failed'}</h1>
          <p>
            ${
              success
                ? `Your account email address has been successfully updated to <span class="highlight">${safeEmailOrError}</span>. You can now return to the Tubo app.`
                : safeEmailOrError || 'This verification link is invalid, expired, or has already been consumed.'
            }
          </p>
          <a href="tubo://" class="btn">Return to Tubo App</a>
          <div class="footer-text">
            If the button doesn't open the app automatically, you can simply switch back to the application.
          </div>
        </div>
      </body>
    </html>
  `;
}

export function renderResetPasswordPortal(token: string, error?: string): string {
  const safeToken = escapeHtml(token);
  const safeError = error ? escapeHtml(error) : '';
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Password - Tubo Vault</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #000000;
            color: #ffffff;
            margin: 0;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .card {
            background-color: #121316;
            border: 1px solid #27272a;
            border-radius: 20px;
            padding: 40px 32px;
            max-width: 440px;
            width: 100%;
            box-shadow: 0 20px 50px rgba(0,0,0,0.7);
          }
          .brand-badge {
            display: inline-block;
            padding: 4px 10px;
            background: rgba(6, 182, 212, 0.12);
            border: 1px solid rgba(6, 182, 212, 0.3);
            border-radius: 20px;
            color: #06b6d4;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 1px;
            margin-bottom: 16px;
          }
          h1 {
            font-size: 22px;
            font-weight: 800;
            margin: 0 0 8px;
            color: #ffffff;
          }
          p.subtitle {
            color: #a1a1aa;
            font-size: 14px;
            margin: 0 0 24px;
            line-height: 20px;
          }
          .form-group {
            margin-bottom: 18px;
            text-align: left;
          }
          label {
            display: block;
            font-size: 11px;
            font-weight: 800;
            color: #d4d4d8;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            margin-bottom: 6px;
          }
          .input-wrap {
            position: relative;
          }
          input[type="password"], input[type="text"] {
            width: 100%;
            background-color: #09090b;
            border: 1px solid #27272a;
            border-radius: 10px;
            padding: 12px 14px;
            color: #ffffff;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s;
          }
          input:focus {
            border-color: #06b6d4;
          }
          .toggle-btn {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: #71717a;
            cursor: pointer;
            font-size: 13px;
          }
          .error-banner {
            background-color: rgba(239, 68, 68, 0.12);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #ef4444;
            padding: 10px 14px;
            border-radius: 10px;
            font-size: 13px;
            margin-bottom: 18px;
          }
          .submit-btn {
            width: 100%;
            background-color: #06b6d4;
            color: #000000;
            border: none;
            border-radius: 10px;
            padding: 14px;
            font-weight: 800;
            font-size: 15px;
            cursor: pointer;
            margin-top: 10px;
            transition: opacity 0.2s;
          }
          .submit-btn:hover { opacity: 0.9; }
          .footer-note {
            margin-top: 24px;
            font-size: 12px;
            color: #71717a;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="brand-badge">TUBO VAULT • SECURITY</div>
          <h1>Set New Password</h1>
          <p class="subtitle">Choose a secure password with at least 6 characters.</p>

          ${safeError ? `<div class="error-banner">${safeError}</div>` : ''}

          <form method="POST" action="/auth/reset-password">
            <input type="hidden" name="token" value="${safeToken}" />

            <div class="form-group">
              <label for="newPassword">New Password</label>
              <div class="input-wrap">
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  placeholder="At least 6 characters"
                  required
                  minlength="6"
                />
                <button type="button" class="toggle-btn" onclick="togglePassword('newPassword', this)">Show</button>
              </div>
            </div>

            <div class="form-group">
              <label for="confirmPassword">Confirm Password</label>
              <div class="input-wrap">
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  placeholder="Repeat new password"
                  required
                  minlength="6"
                />
                <button type="button" class="toggle-btn" onclick="togglePassword('confirmPassword', this)">Show</button>
              </div>
            </div>

            <button type="submit" class="submit-btn">Update Password</button>
          </form>

          <div class="footer-note">
            Once updated, all existing sessions on other devices will be securely signed out.
          </div>
        </div>

        <script>
          function togglePassword(fieldId, btn) {
            var field = document.getElementById(fieldId);
            if (field.type === 'password') {
              field.type = 'text';
              btn.innerText = 'Hide';
            } else {
              field.type = 'password';
              btn.innerText = 'Show';
            }
          }
        </script>
      </body>
    </html>
  `;
}

export function renderPasswordResetSuccessPage(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset Successful - Tubo Vault</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #000000;
            color: #ffffff;
            margin: 0;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .card {
            background-color: #121316;
            border: 1px solid #27272a;
            border-radius: 20px;
            padding: 40px 30px;
            max-width: 440px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 50px rgba(0,0,0,0.7);
          }
          .icon-box {
            width: 64px;
            height: 64px;
            border-radius: 20px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid #10b981;
          }
          h1 {
            font-size: 24px;
            font-weight: 800;
            margin: 0 0 10px;
            color: #ffffff;
          }
          p {
            color: #a1a1aa;
            font-size: 15px;
            line-height: 24px;
            margin: 0 0 28px;
          }
          .btn {
            display: inline-block;
            background: #10b981;
            color: #000000;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 12px;
            font-weight: 800;
            font-size: 15px;
            width: 100%;
          }
          .btn:hover { opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon-box">🎉</div>
          <h1>Password Reset Complete!</h1>
          <p>Your password has been changed successfully. You can now log into your account using your new password.</p>
          <a href="tubo://" class="btn">Return to Tubo App</a>
        </div>
      </body>
    </html>
  `;
}

export function renderAcceptInviteSetupPasswordPage(params: {
  token: string;
  email: string;
  teamName: string;
  workspaceName: string;
  error?: string;
}): string {
  const safeToken = escapeHtml(params.token);
  const safeEmail = escapeHtml(params.email);
  const safeTeamName = escapeHtml(params.teamName);
  const safeWorkspaceName = escapeHtml(params.workspaceName);
  const safeError = params.error ? escapeHtml(params.error) : '';
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Join ${safeTeamName} - Tubo Vault</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #000000;
            color: #ffffff;
            margin: 0;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .card {
            background-color: #121316;
            border: 1px solid #27272a;
            border-radius: 20px;
            padding: 40px 30px;
            max-width: 460px;
            width: 100%;
            box-shadow: 0 20px 50px rgba(0,0,0,0.7);
          }
          .icon-box {
            width: 60px;
            height: 60px;
            border-radius: 18px;
            margin: 0 auto 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            background: rgba(6, 182, 212, 0.15);
            border: 1px solid #06b6d4;
          }
          .header {
            text-align: center;
            margin-bottom: 24px;
          }
          h1 {
            font-size: 22px;
            font-weight: 800;
            margin: 0 0 8px;
            color: #ffffff;
          }
          .subtitle {
            color: #a1a1aa;
            font-size: 14px;
            line-height: 20px;
            margin: 0;
          }
          .team-pill {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid #27272a;
            border-radius: 12px;
            padding: 14px;
            margin-bottom: 24px;
            text-align: center;
          }
          .team-title {
            color: #06b6d4;
            font-weight: 700;
            font-size: 15px;
            margin-bottom: 4px;
          }
          .team-meta {
            color: #71717a;
            font-size: 12px;
          }
          .user-email-badge {
            display: inline-block;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.3);
            color: #10b981;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            margin-top: 6px;
          }
          .form-group {
            margin-bottom: 18px;
            text-align: left;
          }
          label {
            display: block;
            font-size: 12px;
            font-weight: 700;
            color: #a1a1aa;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
          }
          input {
            width: 100%;
            background-color: #0a0a0c;
            border: 1px solid #27272a;
            border-radius: 10px;
            padding: 13px 16px;
            color: #ffffff;
            font-size: 15px;
            outline: none;
            transition: border-color 0.2s;
          }
          input:focus {
            border-color: #06b6d4;
          }
          .error-box {
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid #ef4444;
            color: #fca5a5;
            padding: 12px 16px;
            border-radius: 10px;
            font-size: 13px;
            margin-bottom: 20px;
            line-height: 18px;
          }
          .submit-btn {
            width: 100%;
            background: #06b6d4;
            color: #000000;
            border: none;
            padding: 14px;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 800;
            cursor: pointer;
            transition: opacity 0.2s;
            margin-top: 8px;
          }
          .submit-btn:hover {
            opacity: 0.9;
          }
          .footer-note {
            color: #71717a;
            font-size: 12px;
            text-align: center;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon-box">✉️</div>
          <div class="header">
            <h1>You're Invited!</h1>
            <p class="subtitle">Set up a password to create your account and join the team.</p>
          </div>

          <div class="team-box team-pill">
            <div class="team-title">📁 ${safeTeamName}</div>
            <div class="team-meta">🏢 Workspace: ${safeWorkspaceName}</div>
            <div class="user-email-badge">Invited: ${safeEmail}</div>
          </div>

          ${safeError ? `<div class="error-box">${safeError}</div>` : ''}

          <form method="POST" action="/auth/accept-invite">
            <input type="hidden" name="token" value="${safeToken}" />
            <div class="form-group">
              <label for="name">Your Full Name</label>
              <input type="text" id="name" name="name" placeholder="e.g. Sarah Connor" required />
            </div>
            <div class="form-group">
              <label for="password">Create New Password</label>
              <input type="password" id="password" name="password" placeholder="At least 6 characters" required minlength="6" />
            </div>
            <div class="form-group">
              <label for="confirmPassword">Confirm Password</label>
              <input type="password" id="confirmPassword" name="confirmPassword" placeholder="Repeat your password" required minlength="6" />
            </div>
            <button type="submit" class="submit-btn">Create Account & Join Team</button>
          </form>

          <p class="footer-note">Invitation links expire in 1 hour.</p>
        </div>
      </body>
    </html>
  `;
}

export function renderInviteSuccessPage(params: {
  email: string;
  teamName: string;
  workspaceName: string;
  alreadyExisted: boolean;
}): string {
  const safeEmail = escapeHtml(params.email);
  const safeTeamName = escapeHtml(params.teamName);
  const safeWorkspaceName = escapeHtml(params.workspaceName);
  const { alreadyExisted } = params;
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to ${safeTeamName}! - Tubo Vault</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #000000;
            color: #ffffff;
            margin: 0;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .card {
            background-color: #121316;
            border: 1px solid #27272a;
            border-radius: 20px;
            padding: 40px 30px;
            max-width: 460px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 50px rgba(0,0,0,0.7);
          }
          .icon-box {
            width: 64px;
            height: 64px;
            border-radius: 20px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid #10b981;
          }
          h1 {
            font-size: 24px;
            font-weight: 800;
            margin: 0 0 10px;
            color: #ffffff;
          }
          p {
            color: #a1a1aa;
            font-size: 15px;
            line-height: 24px;
            margin: 0 0 24px;
          }
          .highlight {
            color: #10b981;
            font-weight: 700;
          }
          .team-box {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid #27272a;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 28px;
            text-align: left;
          }
          .team-name {
            color: #06b6d4;
            font-weight: 700;
            font-size: 16px;
            margin-bottom: 4px;
          }
          .ws-name {
            color: #71717a;
            font-size: 13px;
          }
          .btn {
            display: inline-block;
            background: #10b981;
            color: #000000;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 12px;
            font-weight: 800;
            font-size: 15px;
            width: 100%;
            cursor: pointer;
          }
          .btn:hover { opacity: 0.9; }
          .countdown {
            margin-top: 18px;
            font-size: 12px;
            color: #71717a;
          }
        </style>
        <script>
          let seconds = 3;
          function tryDeepLink() {
            window.location.href = "tubo://team";
          }
          window.onload = function() {
            tryDeepLink();
            const counterEl = document.getElementById('count');
            const timer = setInterval(function() {
              seconds--;
              if (counterEl) counterEl.innerText = seconds;
              if (seconds <= 0) {
                clearInterval(timer);
                tryDeepLink();
              }
            }, 1000);
          };
        </script>
      </head>
      <body>
        <div class="card">
          <div class="icon-box">🚀</div>
          <h1>You're In!</h1>
          <p>
            ${alreadyExisted 
              ? `Your account (<span class="highlight">${safeEmail}</span>) has been added to the team.` 
              : `Your account has been created and enrolled in the team.`}
          </p>
          <div class="team-box">
            <div class="team-name">📁 ${safeTeamName}</div>
            <div class="ws-name">🏢 Workspace: ${safeWorkspaceName}</div>
          </div>
          <a href="tubo://team" class="btn">Open in Tubo Vault App</a>
          <div class="countdown">Opening Tubo Vault in <span id="count">3</span>s...</div>
        </div>
      </body>
    </html>
  `;
}

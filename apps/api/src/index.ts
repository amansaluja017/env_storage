import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import cors from 'cors';
import * as trpcExpress from '@trpc/server/adapters/express';
import bcrypt from 'bcryptjs';
import { appRouter } from './router.js';
import { createContext } from './context.js';
import { tokenStore } from './storage/tokenStore.js';
import { dataStore } from './storage/store.js';
import { pgDb, users, eq } from '@tubo/db';
import {
  renderEmailVerifiedPage,
  renderResetPasswordPortal,
  renderPasswordResetSuccessPage,
  renderAcceptInviteSetupPasswordPage,
  renderInviteSuccessPage,
} from './views/webAuthPages.js';
import { seedInitialData } from './seed.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// tRPC Express middleware
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Web Endpoint: Verify Email Change
app.get('/auth/verify-email', async (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.send(renderEmailVerifiedPage(false, 'Verification token is missing.'));
  }

  try {
    const tokenRecord = await tokenStore.findValidToken(token, 'verificationToken');
    if (!tokenRecord || !tokenRecord.userId) {
      return res.send(
        renderEmailVerifiedPage(
          false,
          'This verification link is invalid, expired, or has already been used.'
        )
      );
    }

    let meta: { newEmail?: string } = {};
    if (tokenRecord.metadata) {
      try {
        meta = JSON.parse(tokenRecord.metadata);
      } catch {
        meta = {};
      }
    }

    const newEmail = meta.newEmail;
    if (!newEmail) {
      return res.send(
        renderEmailVerifiedPage(false, 'Invalid verification metadata. Please try again.')
      );
    }

    // Check if new email is already used by another user
    const existing = await pgDb.select().from(users).where(eq(users.email, newEmail));
    if (existing.length > 0 && existing[0].id !== tokenRecord.userId) {
      return res.send(
        renderEmailVerifiedPage(false, 'This email address is already registered to another account.')
      );
    }

    // Atomically consume token
    const consumed = await tokenStore.consumeToken(token);
    if (!consumed) {
      return res.send(
        renderEmailVerifiedPage(false, 'This verification link has already been used.')
      );
    }

    // Update user's email in PostgreSQL
    await pgDb.update(users).set({ email: newEmail }).where(eq(users.id, tokenRecord.userId));

    return res.send(renderEmailVerifiedPage(true, newEmail));
  } catch (err: any) {
    console.error('Error verifying email:', err);
    return res.send(
      renderEmailVerifiedPage(false, 'An unexpected server error occurred. Please try again.')
    );
  }
});

// Web Endpoint: Reset Password Portal (GET)
app.get('/auth/reset-password', async (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.send(
      renderResetPasswordPortal('', 'Password reset token is missing. Please check your email link.')
    );
  }

  try {
    const tokenRecord = await tokenStore.findValidToken(token, 'passwordResetToken');
    if (!tokenRecord) {
      return res.send(
        renderResetPasswordPortal(
          '',
          'This password reset link is invalid, expired, or has already been used.'
        )
      );
    }

    return res.send(renderResetPasswordPortal(token));
  } catch (err: any) {
    return res.send(
      renderResetPasswordPortal('', 'An error occurred while validating the reset link.')
    );
  }
});

// Web Endpoint: Reset Password Submission (POST)
app.post('/auth/reset-password', async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (!token) {
    return res.send(
      renderResetPasswordPortal('', 'Reset token is missing. Please request a new link.')
    );
  }

  if (!newPassword || newPassword.length < 6) {
    return res.send(
      renderResetPasswordPortal(token, 'New password must be at least 6 characters long.')
    );
  }

  if (newPassword !== confirmPassword) {
    return res.send(
      renderResetPasswordPortal(token, 'Passwords do not match. Please verify both fields.')
    );
  }

  try {
    const tokenRecord = await tokenStore.findValidToken(token, 'passwordResetToken');
    if (!tokenRecord || !tokenRecord.userId) {
      return res.send(
        renderResetPasswordPortal(
          '',
          'This password reset token has expired or already been used. Please request a new link.'
        )
      );
    }

    const consumed = await tokenStore.consumeToken(token);
    if (!consumed) {
      return res.send(
        renderResetPasswordPortal(
          '',
          'This password reset token was already used. Please request a new link.'
        )
      );
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await pgDb
      .update(users)
      .set({ passwordHash: newPasswordHash })
      .where(eq(users.id, tokenRecord.userId));

    // Revoke all refresh tokens for security
    await tokenStore.revokeUserTokens(tokenRecord.userId, 'refreshToken');

    return res.send(renderPasswordResetSuccessPage());
  } catch (err: any) {
    console.error('Error resetting password:', err);
    return res.send(
      renderResetPasswordPortal(token, 'Failed to update password due to a server error.')
    );
  }
});

// Web Endpoint: Accept Team Invitation (GET)
app.get('/auth/accept-invite', async (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.send(
      renderEmailVerifiedPage(false, 'Invitation token is missing. Please check your email link.')
    );
  }

  try {
    const details = await dataStore.findInviteDetails(token);
    if (!details) {
      return res.send(
        renderEmailVerifiedPage(
          false,
          'This invitation link is invalid, has expired (invitations are valid for 1 hour), or has already been accepted.'
        )
      );
    }

    const teamName = details.team?.name || 'Team';
    const workspaceName = details.workspace?.name || 'Workspace';

    // 1. If user already exists, add directly to team and show success
    if (details.existingUser) {
      await dataStore.completeInviteForExistingUser(token, details.existingUser);
      return res.send(
        renderInviteSuccessPage({
          email: details.invite.email,
          teamName,
          workspaceName,
          alreadyExisted: true,
        })
      );
    }

    // 2. If user does NOT exist, render password setup form
    return res.send(
      renderAcceptInviteSetupPasswordPage({
        token,
        email: details.invite.email,
        teamName,
        workspaceName,
      })
    );
  } catch (err: any) {
    console.error('Error accepting invitation:', err);
    return res.send(
      renderEmailVerifiedPage(false, err.message || 'Failed to process team invitation.')
    );
  }
});

// Web Endpoint: Complete Team Invitation & Set Password (POST)
app.post('/auth/accept-invite', async (req, res) => {
  const { token, name, password, confirmPassword } = req.body;
  if (!token) {
    return res.send(
      renderEmailVerifiedPage(false, 'Invitation token is missing.')
    );
  }

  try {
    const details = await dataStore.findInviteDetails(token);
    if (!details) {
      return res.send(
        renderEmailVerifiedPage(
          false,
          'This invitation link has expired (valid for 1 hour) or was already used.'
        )
      );
    }

    const teamName = details.team?.name || 'Team';
    const workspaceName = details.workspace?.name || 'Workspace';

    // If user already exists, complete invite directly
    if (details.existingUser) {
      await dataStore.completeInviteForExistingUser(token, details.existingUser);
      return res.send(
        renderInviteSuccessPage({
          email: details.invite.email,
          teamName,
          workspaceName,
          alreadyExisted: true,
        })
      );
    }

    // Validate passwords
    if (!password || password.length < 6) {
      return res.send(
        renderAcceptInviteSetupPasswordPage({
          token,
          email: details.invite.email,
          teamName,
          workspaceName,
          error: 'Password must be at least 6 characters long.',
        })
      );
    }

    if (password !== confirmPassword) {
      return res.send(
        renderAcceptInviteSetupPasswordPage({
          token,
          email: details.invite.email,
          teamName,
          workspaceName,
          error: 'Passwords do not match. Please verify and try again.',
        })
      );
    }

    await dataStore.completeInviteAndCreateUser(token, name || '', password);

    return res.send(
      renderInviteSuccessPage({
        email: details.invite.email,
        teamName,
        workspaceName,
        alreadyExisted: false,
      })
    );
  } catch (err: any) {
    console.error('Error completing invitation registration:', err);
    return res.send(
      renderEmailVerifiedPage(false, err.message || 'Failed to complete registration.')
    );
  }
});

// REST Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Tubo API Server',
    trpc: '/trpc',
    timestamp: new Date().toISOString(),
  });
});

// Seed and verify initial accounts & admin role on launch
seedInitialData().catch(err => {
  console.error('Error during initial seed verification:', err);
});

app.listen(PORT, () => {
  console.log(`🚀 Tubo Express + tRPC Server running on http://localhost:${PORT}`);
  console.log(`⚡ tRPC Endpoint: http://localhost:${PORT}/trpc (Auth, Workspace, Team, Folder, Env)`);
});

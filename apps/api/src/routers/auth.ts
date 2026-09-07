import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { JWT_SECRET, JWT_REFRESH_SECRET } from '../context.js';
import { pgDb, users, teamInvites, teams, workspaces, eq } from '@tubo/db';
import { TRPCError } from '@trpc/server';
import { tokenStore } from '../storage/tokenStore.js';
import {
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  getPublicBaseUrl,
} from '../services/emailService.js';

// Token Expirations
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes for access token
const ACCESS_TOKEN_EXPIRY_SEC = 900;
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Utility to generate Access Token and persist Refresh Token in DB tokens table
 */
async function generateAndStoreTokens(payload: { id: string; email: string; name: string; role?: 'admin' | 'member' }) {
  const tokenPayload: any = { id: payload.id, email: payload.email, name: payload.name, type: 'access' };
  if (payload.role) tokenPayload.role = payload.role;
  const accessToken = jwt.sign(
    tokenPayload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshTokenPayload: any = { id: payload.id, email: payload.email, name: payload.name, type: 'refresh' };
  if (payload.role) refreshTokenPayload.role = payload.role;
  const refreshToken = jwt.sign(
    refreshTokenPayload,
    JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
  );

  // Store refresh token strictly in PostgreSQL tokens table
  await tokenStore.createToken({
    userId: payload.id,
    type: 'refreshToken',
    token: refreshToken,
    expiresInMs: REFRESH_TOKEN_EXPIRY_MS,
    metadata: { email: payload.email },
  });

  return {
    token: accessToken, // Retained for backwards compatibility with existing clients
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY_SEC,
  };
}

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().min(2),
        password: z.string().min(6),
      })
    )
    .mutation(async ({ input }) => {
      const email = input.email.toLowerCase().trim();

      // Verify user doesn't already exist in database
      const existing = await pgDb.select().from(users).where(eq(users.email, email));
      if (existing.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An account with this email address already exists.',
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 10);
      const userId = crypto.randomUUID();

      // Save strictly to PostgreSQL
      await pgDb.insert(users).values({
        id: userId,
        email,
        name: input.name.trim(),
        passwordHash,
      });

      const tokens = await generateAndStoreTokens({
        id: userId,
        email,
        name: input.name.trim(),
      });

      return {
        ...tokens,
        user: {
          id: userId,
          email,
          name: input.name.trim(),
        },
      };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const email = input.email.toLowerCase().trim();

      // Retrieve user strictly from PostgreSQL database
      const res = await pgDb.select().from(users).where(eq(users.email, email));
      if (res.length === 0) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      const foundUser = res[0];

      // Compare password against stored hash
      const isValidPassword = await bcrypt.compare(input.password, foundUser.passwordHash);
      if (!isValidPassword) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      const tokens = await generateAndStoreTokens({
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
      });

      return {
        ...tokens,
        user: {
          id: foundUser.id,
          email: foundUser.email,
          name: foundUser.name,
        },
      };
    }),

  /**
   * Renew / Refresh Access Token endpoint
   * Validates strictly against the tokens table in the database and performs token rotation
   */
  refreshToken: publicProcedure
    .input(
      z.object({
        refreshToken: z.string().min(1, 'Refresh token is required'),
      })
    )
    .mutation(async ({ input }) => {
      // 1. Check if token exists in tokens table, is active, not revoked, and not expired
      const tokenRecord = await tokenStore.findValidToken(input.refreshToken, 'refreshToken');
      if (!tokenRecord) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid, expired, or revoked refresh token. Please sign in again.',
        });
      }

      // 2. Atomically consume the token first (conditional update ensuring consumed_at is null)
      const consumed = await tokenStore.consumeToken(input.refreshToken, 'refreshToken');
      if (!consumed) {
        // Token was already consumed (reuse attack) - revoke user's remaining refresh tokens
        if (tokenRecord.userId) {
          await tokenStore.revokeUserTokens(tokenRecord.userId, 'refreshToken');
        }
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Refresh token was already used or revoked. Please sign in again.',
        });
      }

      // 3. Cryptographic signature verification
      let decoded: { id: string; email: string; name: string };
      try {
        decoded = jwt.verify(input.refreshToken, JWT_REFRESH_SECRET) as any;
      } catch (err: any) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Malformed or expired refresh token signature.',
        });
      }

      // 4. Locate user strictly in Postgres DB
      const targetUserId = tokenRecord.userId || decoded.id;
      const res = await pgDb.select().from(users).where(eq(users.id, targetUserId));
      if (res.length === 0) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'User associated with refresh token no longer exists.',
        });
      }

      const user = res[0];

      // 5. Issue new access token and new rotated refresh token saved to DB
      const tokens = await generateAndStoreTokens({
        id: user.id,
        email: user.email,
        name: user.name,
      });

      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };
    }),

  /**
   * Log out / Revoke Tokens
   * Consumes the active refresh token in the database tokens table and revokes user refresh sessions
   */
  logout: publicProcedure
    .input(
      z
        .object({
          refreshToken: z.string().optional(),
        })
        .optional()
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user?.id && !input?.refreshToken) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Authentication session or refresh token is required to log out.',
        });
      }

      if (input?.refreshToken) {
        const consumed = await tokenStore.consumeToken(input.refreshToken, 'refreshToken');
        if (!consumed && !ctx.user?.id) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid or already consumed refresh token.',
          });
        }
      }

      if (ctx.user?.id) {
        await tokenStore.revokeUserTokens(ctx.user.id, 'refreshToken');
      }

      return {
        success: true,
        message: 'Logged out successfully',
      };
    }),

  /**
   * Request Password Reset Token
   * Generates a passwordResetToken stored strictly in the database tokens table with 1 hour expiry
   */
  requestPasswordReset: publicProcedure
    .input(
      z.object({
        email: z.string().email('Valid email address required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const ACK_MESSAGE =
        'If an account exists with this email address, password reset instructions have been generated.';

      // Find user strictly in Postgres DB
      const res = await pgDb.select().from(users).where(eq(users.email, email));
      if (res.length === 0) {
        // Return neutral message without leaking user existence
        return {
          success: true,
          message: ACK_MESSAGE,
        };
      }

      const foundUser = res[0];

      // Invalidate any previous password reset tokens for this user in DB
      await tokenStore.revokeUserTokens(foundUser.id, 'passwordResetToken');

      // Generate secure reset token
      const resetToken = 'rst_' + crypto.randomBytes(24).toString('hex');
      await tokenStore.createToken({
        userId: foundUser.id,
        type: 'passwordResetToken',
        token: resetToken,
        expiresInMs: PASSWORD_RESET_EXPIRY_MS,
        metadata: { email: foundUser.email },
      });

      const publicBaseUrl = getPublicBaseUrl(ctx.req);
      const resetUrl = `${publicBaseUrl}/auth/reset-password?token=${resetToken}`;
      const mailResult = await sendPasswordResetEmail(foundUser.email, resetUrl);

      return {
        success: true,
        message: ACK_MESSAGE,
        ...(process.env.NODE_ENV !== 'production' && mailResult.previewUrl
          ? { previewUrl: mailResult.previewUrl }
          : {}),
      };
    }),

  /**
   * Reset Password
   * Validates token from DB tokens table, updates user passwordHash, consumes token, and revokes active refresh tokens
   */
  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(1, 'Reset token is required'),
        newPassword: z.string().min(6, 'New password must be at least 6 characters'),
      })
    )
    .mutation(async ({ input }) => {
      // 1. Verify token exists in PostgreSQL tokens table, is type 'passwordResetToken', unused and unexpired
      const tokenRecord = await tokenStore.findValidToken(input.token, 'passwordResetToken');
      if (!tokenRecord || !tokenRecord.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid, already used, or expired password reset token.',
        });
      }

      // 2. Consume the reset token atomically
      const consumed = await tokenStore.consumeToken(input.token, 'passwordResetToken');
      if (!consumed) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid, already used, or expired password reset token.',
        });
      }

      // 3. Hash new password
      const newPasswordHash = await bcrypt.hash(input.newPassword, 10);

      // 4. Update password strictly in PostgreSQL
      await pgDb
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, tokenRecord.userId));

      // 5. Revoke all existing refresh tokens for security in PostgreSQL
      await tokenStore.revokeUserTokens(tokenRecord.userId, 'refreshToken');

      return {
        success: true,
        message: 'Your password has been successfully reset. Please log in with your new password.',
      };
    }),

  /**
   * Validate a token's status (for previewing reset links or invite codes)
   */
  validateToken: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        type: z.enum(['verificationToken', 'passwordResetToken', 'inviteToken', 'refreshToken']),
      })
    )
    .query(async ({ input }) => {
      const record = await tokenStore.findValidToken(input.token, input.type);
      return {
        valid: !!record,
        type: input.type,
        expiresAt: record?.expiresAt || null,
      };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    return {
      user: ctx.user,
    };
  }),

  /**
   * Fetch full account information and team invites
   */
  getAccountInfo: protectedProcedure.query(async ({ ctx }) => {
    const res = await pgDb.select().from(users).where(eq(users.id, ctx.user.id));
    if (res.length === 0) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User account not found',
      });
    }

    const currentUser = res[0];
    const userCode = `TUBO-${currentUser.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()}-${currentUser.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

    // Look for any team invites sent to this user's email
    const invites = await pgDb
      .select({
        id: teamInvites.id,
        inviteCode: teamInvites.inviteCode,
        email: teamInvites.email,
        role: teamInvites.role,
        status: teamInvites.status,
        teamId: teamInvites.teamId,
        workspaceId: teamInvites.workspaceId,
        createdAt: teamInvites.createdAt,
        teamName: teams.name,
      })
      .from(teamInvites)
      .leftJoin(teams, eq(teamInvites.teamId, teams.id))
      .where(eq(teamInvites.email, currentUser.email.toLowerCase().trim()));

    const activeInvite = invites.find(i => i.status === 'pending');

    return {
      user: {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        createdAt: currentUser.createdAt,
      },
      userCode,
      activeInviteCode: activeInvite ? activeInvite.inviteCode : null,
      invites,
    };
  }),

  /**
   * Request Account Email Change
   * Validates current password, checks availability, generates verificationToken,
   * and sends an email verification link via Nodemailer (Gmail)
   */
  requestEmailChange: protectedProcedure
    .input(
      z.object({
        newEmail: z.string().email('Please enter a valid email address'),
        currentPassword: z.string().min(1, 'Current password is required to verify your identity'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const newEmail = input.newEmail.toLowerCase().trim();

      const res = await pgDb.select().from(users).where(eq(users.id, ctx.user.id));
      if (res.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User account not found',
        });
      }

      const currentUser = res[0];

      // Verify current password
      const isPasswordValid = await bcrypt.compare(input.currentPassword, currentUser.passwordHash);
      if (!isPasswordValid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Incorrect current password. Please try again.',
        });
      }

      // If same email, nothing to update
      if (newEmail === currentUser.email.toLowerCase().trim()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Your account is already registered with this email address.',
        });
      }

      // Verify new email is not already taken by another user
      const existing = await pgDb.select().from(users).where(eq(users.email, newEmail));
      if (existing.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This email address is already registered to another account.',
        });
      }

      // Invalidate any existing verificationToken for this user
      await tokenStore.revokeUserTokens(currentUser.id, 'verificationToken');

      // Generate verification token (24h expiry)
      const verifyToken = 'vfy_' + crypto.randomBytes(24).toString('hex');
      await tokenStore.createToken({
        userId: currentUser.id,
        type: 'verificationToken',
        token: verifyToken,
        expiresInMs: 24 * 60 * 60 * 1000,
        metadata: JSON.stringify({ newEmail, userId: currentUser.id }),
      });

      const publicBaseUrl = getPublicBaseUrl(ctx.req);
      const verifyUrl = `${publicBaseUrl}/auth/verify-email?token=${verifyToken}`;
      const mailResult = await sendEmailVerificationEmail(newEmail, verifyUrl);

      if (!mailResult.success && process.env.NODE_ENV === 'production') {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'Failed to deliver email verification. Please check server email service configuration (e.g. BREVO_API_KEY).',
        });
      }

      return {
        success: true,
        message: `Verification link sent to ${newEmail}. Please click the link to confirm your new email address.`,
        previewUrl: mailResult.previewUrl,
      };
    }),

  /**
   * Change Account Password
   * Requires current password verification and checks that newPassword matches confirmPassword
   */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string().min(6, 'New password must be at least 6 characters'),
        confirmPassword: z.string().min(6, 'Please confirm your new password').optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const res = await pgDb.select().from(users).where(eq(users.id, ctx.user.id));
      if (res.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User account not found',
        });
      }

      const currentUser = res[0];

      // Verify current password
      const isPasswordValid = await bcrypt.compare(input.currentPassword, currentUser.passwordHash);
      if (!isPasswordValid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Current password is incorrect.',
        });
      }

      if (input.confirmPassword && input.newPassword !== input.confirmPassword) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'New password and confirmation password do not match.',
        });
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(input.newPassword, 10);

      // Update password strictly in PostgreSQL
      await pgDb
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, ctx.user.id));

      // Revoke any existing refresh tokens
      await tokenStore.revokeUserTokens(ctx.user.id, 'refreshToken');

      return {
        success: true,
        message: 'Your password has been changed successfully.',
      };
    }),
});

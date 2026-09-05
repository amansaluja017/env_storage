import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { JWT_SECRET, JWT_REFRESH_SECRET } from '../context.js';
import { pgDb, users, eq } from '@tubo/db';
import { TRPCError } from '@trpc/server';
import { tokenStore } from '../storage/tokenStore.js';

// Token Expirations
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes for access token
const ACCESS_TOKEN_EXPIRY_SEC = 900;
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Utility to generate Access Token and persist Refresh Token in DB tokens table
 */
async function generateAndStoreTokens(payload: { id: string; email: string; name: string }) {
  const accessToken = jwt.sign(
    { id: payload.id, email: payload.email, name: payload.name, type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    { id: payload.id, email: payload.email, name: payload.name, type: 'refresh' },
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
      const userId = 'user_' + Math.random().toString(36).substring(2, 10);

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

      // 2. Cryptographic signature verification
      let decoded: { id: string; email: string; name: string };
      try {
        decoded = jwt.verify(input.refreshToken, JWT_REFRESH_SECRET) as any;
      } catch (err: any) {
        // Invalidate DB token record if signature is invalid
        await tokenStore.consumeToken(tokenRecord.id);
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Malformed or expired refresh token signature.',
        });
      }

      // 3. Mark the used refresh token as consumed (token rotation)
      await tokenStore.consumeToken(tokenRecord.id);

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
      if (input?.refreshToken) {
        await tokenStore.consumeToken(input.refreshToken);
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
    .mutation(async ({ input }) => {
      const email = input.email.toLowerCase().trim();

      // Find user strictly in Postgres DB
      const res = await pgDb.select().from(users).where(eq(users.email, email));
      if (res.length === 0) {
        // Return friendly message without leaking user existence
        return {
          success: true,
          message: 'If an account exists with this email, password reset instructions have been generated.',
        };
      }

      const foundUser = res[0];

      // Invalidate any previous password reset tokens for this user in DB
      await tokenStore.revokeUserTokens(foundUser.id, 'passwordResetToken');

      // Generate secure reset token
      const resetToken = 'rst_' + crypto.randomBytes(24).toString('hex');
      const tokenRecord = await tokenStore.createToken({
        userId: foundUser.id,
        type: 'passwordResetToken',
        token: resetToken,
        expiresInMs: PASSWORD_RESET_EXPIRY_MS,
        metadata: { email: foundUser.email },
      });

      return {
        success: true,
        message: 'Password reset token generated successfully.',
        resetToken: tokenRecord.token,
        expiresAt: tokenRecord.expiresAt,
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

      // 2. Hash new password
      const newPasswordHash = await bcrypt.hash(input.newPassword, 10);

      // 3. Update password strictly in PostgreSQL
      await pgDb
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, tokenRecord.userId));

      // 4. Consume the reset token in PostgreSQL
      await tokenStore.consumeToken(tokenRecord.id);

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
        type: z.enum(['refreshToken', 'verificationToken', 'passwordResetToken', 'teamInviteToken']),
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
});

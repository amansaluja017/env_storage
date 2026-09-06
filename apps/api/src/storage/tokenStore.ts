import crypto from 'node:crypto';
import { pgDb, tokens, eq, and, gt, isNull, TokenType } from '@tubo/db';

export type { TokenType };

export interface TokenRecord {
  id: string;
  userId: string | null;
  token: string;
  type: TokenType;
  expiresAt: Date;
  consumedAt: Date | null;
  metadata?: string | null;
  createdAt: Date;
}

/**
 * Creates a SHA-256 hash digest of a raw token string for secure persistence and lookup
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const tokenStore = {
  /**
   * Persist a token record strictly in PostgreSQL database using SHA-256 hash
   */
  async createToken(params: {
    userId?: string | null;
    type: TokenType;
    token: string;
    expiresInMs: number;
    metadata?: Record<string, any> | string | null;
  }): Promise<TokenRecord> {
    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + params.expiresInMs);
    const metadataStr =
      typeof params.metadata === 'object' && params.metadata !== null
        ? JSON.stringify(params.metadata)
        : params.metadata || null;

    const hashedToken = hashToken(params.token);

    const record: TokenRecord = {
      id,
      userId: params.userId || null,
      token: params.token, // Raw token preserved in returned in-memory object for delivery
      type: params.type,
      expiresAt,
      consumedAt: null,
      metadata: metadataStr,
      createdAt: now,
    };

    await pgDb.insert(tokens).values({
      id: record.id,
      userId: record.userId,
      token: hashedToken, // Stored as SHA-256 hash digest in PostgreSQL
      type: record.type,
      expiresAt: record.expiresAt,
      consumedAt: null,
      metadata: record.metadata,
      createdAt: record.createdAt,
    });

    return record;
  },

  /**
   * Find a token record strictly in PostgreSQL:
   * - Matching the SHA-256 hashed token string
   * - Matching the token type
   * - Not yet consumed (consumedAt is null)
   * - Not expired (expiresAt > now)
   */
  async findValidToken(tokenString: string, type: TokenType): Promise<TokenRecord | null> {
    const hashed = hashToken(tokenString);
    const now = new Date();

    const res = await pgDb
      .select()
      .from(tokens)
      .where(
        and(
          eq(tokens.token, hashed),
          eq(tokens.type, type),
          isNull(tokens.consumedAt),
          gt(tokens.expiresAt, now)
        )
      );

    if (res.length > 0) {
      const row = res[0];
      return {
        id: row.id,
        userId: row.userId,
        token: row.token,
        type: row.type as TokenType,
        expiresAt: row.expiresAt,
        consumedAt: row.consumedAt,
        metadata: row.metadata,
        createdAt: row.createdAt,
      };
    }

    return null;
  },

  /**
   * Atomically mark a token as consumed if not already consumed.
   * Returns true if a row was updated (token was active and is now consumed),
   * false if the token was already consumed or non-existent.
   */
  async consumeToken(tokenString: string): Promise<boolean> {
    const hashed = hashToken(tokenString);
    const now = new Date();

    const result = await pgDb
      .update(tokens)
      .set({ consumedAt: now })
      .where(and(eq(tokens.token, hashed), isNull(tokens.consumedAt)));

    return (result.rowCount ?? 0) > 0;
  },

  /**
   * Revoke all tokens of a specific type for a user strictly in PostgreSQL
   */
  async revokeUserTokens(userId: string, type: TokenType): Promise<void> {
    const now = new Date();

    await pgDb
      .update(tokens)
      .set({ consumedAt: now })
      .where(and(eq(tokens.userId, userId), eq(tokens.type, type), isNull(tokens.consumedAt)));
  },
};

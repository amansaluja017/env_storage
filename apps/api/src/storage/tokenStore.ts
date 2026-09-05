import { pgDb, tokens, eq, and, gt, isNull, or } from '@tubo/db';

export type TokenType =
  | 'refreshToken'
  | 'verificationToken'
  | 'passwordResetToken'
  | 'teamInviteToken'
  | 'refresh'
  | 'verification'
  | 'password_reset'
  | 'team_invite';

export interface TokenRecord {
  id: string;
  userId: string | null;
  token: string;
  type: string;
  expiresAt: Date;
  consumedAt: Date | null;
  metadata?: string | null;
  createdAt: Date;
}

/**
 * Normalizes token type to support both camelCase and snake_case naming
 */
function normalizeType(type: string): string[] {
  if (type === 'refreshToken' || type === 'refresh') return ['refreshToken', 'refresh'];
  if (type === 'verificationToken' || type === 'verification') return ['verificationToken', 'verification'];
  if (type === 'passwordResetToken' || type === 'password_reset') return ['passwordResetToken', 'password_reset'];
  if (type === 'teamInviteToken' || type === 'team_invite') return ['teamInviteToken', 'team_invite'];
  return [type];
}

export const tokenStore = {
  /**
   * Persist a token record strictly in PostgreSQL database
   */
  async createToken(params: {
    userId?: string | null;
    type: TokenType;
    token: string;
    expiresInMs: number;
    metadata?: Record<string, any> | string | null;
  }): Promise<TokenRecord> {
    const id = 'tok_' + Math.random().toString(36).substring(2, 11);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + params.expiresInMs);
    const metadataStr =
      typeof params.metadata === 'object' && params.metadata !== null
        ? JSON.stringify(params.metadata)
        : params.metadata || null;

    const record: TokenRecord = {
      id,
      userId: params.userId || null,
      token: params.token,
      type: params.type,
      expiresAt,
      consumedAt: null,
      metadata: metadataStr,
      createdAt: now,
    };

    await pgDb.insert(tokens).values({
      id: record.id,
      userId: record.userId,
      token: record.token,
      type: record.type as any,
      expiresAt: record.expiresAt,
      consumedAt: null,
      metadata: record.metadata,
      createdAt: record.createdAt,
    });

    return record;
  },

  /**
   * Find a token record strictly in PostgreSQL:
   * - Matching the token string
   * - Matching the token type
   * - Not yet consumed (consumedAt is null)
   * - Not expired (expiresAt > now)
   */
  async findValidToken(tokenString: string, type: TokenType): Promise<TokenRecord | null> {
    const validTypes = normalizeType(type);
    const now = new Date();

    const res = await pgDb
      .select()
      .from(tokens)
      .where(
        and(
          eq(tokens.token, tokenString),
          isNull(tokens.consumedAt),
          gt(tokens.expiresAt, now)
        )
      );

    if (res.length > 0) {
      const row = res[0];
      if (validTypes.includes(row.type)) {
        return {
          id: row.id,
          userId: row.userId,
          token: row.token,
          type: row.type,
          expiresAt: row.expiresAt,
          consumedAt: row.consumedAt,
          metadata: row.metadata,
          createdAt: row.createdAt,
        };
      }
    }

    return null;
  },

  /**
   * Mark a token as consumed (prevents reuse / replay attack) strictly in PostgreSQL
   */
  async consumeToken(tokenIdOrString: string): Promise<boolean> {
    const now = new Date();

    await pgDb
      .update(tokens)
      .set({ consumedAt: now })
      .where(or(eq(tokens.token, tokenIdOrString), eq(tokens.id, tokenIdOrString)));

    return true;
  },

  /**
   * Revoke all tokens of a specific type for a user strictly in PostgreSQL
   */
  async revokeUserTokens(userId: string, type: TokenType): Promise<void> {
    const validTypes = normalizeType(type);
    const now = new Date();

    for (const t of validTypes) {
      await pgDb
        .update(tokens)
        .set({ consumedAt: now })
        .where(and(eq(tokens.userId, userId), eq(tokens.type, t as any), isNull(tokens.consumedAt)));
    }
  },
};

import crypto from 'node:crypto';
import { pgDb, tokens, eq, and, or, gt, isNull, TokenType } from '@tubo/db';

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

const VAULT_MASTER_KEY =
  process.env.VAULT_ENCRYPTION_KEY ||
  process.env.EXPO_PUBLIC_VAULT_KEY ||
  process.env.JWT_SECRET ||
  'tubo_vault_master_aes_key_2026';

const derivedKey = crypto.scryptSync(VAULT_MASTER_KEY, 'tubo_token_salt_v1', 32);

/**
 * Creates a SHA-256 hash digest of a raw token string (retained for backwards compatibility)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Encrypts a token deterministically with AES-256-GCM so it is stored encrypted at rest in PostgreSQL
 */
export function encryptToken(token: string): string {
  if (!token) return '';
  if (token.startsWith('enc:')) return token;
  const iv = crypto.createHmac('sha256', derivedKey).update(token).digest().subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `enc:${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted token.
 * If the string is not encrypted (e.g. legacy plain/hash token), returns it as-is.
 */
export function decryptToken(encryptedStr: string): string {
  if (!encryptedStr || typeof encryptedStr !== 'string') return encryptedStr;
  if (!encryptedStr.startsWith('enc:')) return encryptedStr;
  const parts = encryptedStr.split(':');
  if (parts.length !== 4) return encryptedStr;
  try {
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const ciphertext = parts[3];
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return encryptedStr;
  }
}

export const tokenStore = {
  /**
   * Persist a token record strictly in PostgreSQL database encrypted with AES-256-GCM
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

    const storedToken = encryptToken(params.token);

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
      token: storedToken, // Stored encrypted in PostgreSQL
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
   * - Matching AES-256-GCM encrypted token, SHA-256 hash, or direct string
   * - Matching the token type
   * - Not yet consumed (consumedAt is null)
   * - Not expired (expiresAt > now)
   */
  async findValidToken(tokenString: string, type: TokenType): Promise<TokenRecord | null> {
    const enc = encryptToken(tokenString);
    const hashed = hashToken(tokenString);
    const now = new Date();

    const res = await pgDb
      .select()
      .from(tokens)
      .where(
        and(
          or(
            eq(tokens.token, enc),
            eq(tokens.token, hashed),
            eq(tokens.token, tokenString)
          ),
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
  async consumeToken(tokenString: string, type: TokenType): Promise<boolean> {
    const enc = encryptToken(tokenString);
    const hashed = hashToken(tokenString);
    const now = new Date();

    const result = await pgDb
      .update(tokens)
      .set({ consumedAt: now })
      .where(
        and(
          or(
            eq(tokens.token, enc),
            eq(tokens.token, hashed),
            eq(tokens.token, tokenString)
          ),
          eq(tokens.type, type),
          isNull(tokens.consumedAt)
        )
      );

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

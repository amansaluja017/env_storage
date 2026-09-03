import { inferAsyncReturnType } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import jwt from 'jsonwebtoken';
import { sqliteDb } from '@tubo/db';

export const JWT_SECRET = process.env.JWT_SECRET || 'tubo_secret_key_2026_safe';

export interface UserSession {
  id: string;
  email: string;
  name: string;
}

// In-memory fallback user store if Postgres isn't running locally
export const memoryUsers = new Map<string, { id: string; email: string; name: string; passwordHash: string }>();

// Pre-fill a demo user
memoryUsers.set('user_demo_123', {
  id: 'user_demo_123',
  email: 'alex@tubo.dev',
  name: 'Alex Vance',
  passwordHash: '$2a$10$wE99gV4hD1ZqU3G7eO123u3dJ7x4Z/8p3y10K.mZ2.9g7o3H5',
});

export async function createContext({ req, res }: CreateExpressContextOptions) {
  let user: UserSession | null = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as UserSession;
      user = { id: decoded.id, email: decoded.email, name: decoded.name };
    } catch (err) {
      // Invalid token
    }
  }

  return {
    req,
    res,
    user,
    sqliteDb,
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;

import { inferAsyncReturnType } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import jwt from 'jsonwebtoken';
import { pgDb } from '@tubo/db';

const isDev = process.env.NODE_ENV !== 'production';

if (!process.env.JWT_REFRESH_SECRET && !isDev) {
  throw new Error('FATAL: JWT_REFRESH_SECRET must be configured in non-development environments.');
}

export const JWT_SECRET = process.env.JWT_SECRET || (isDev ? 'tubo_secret_key_2026_dev_safe' : '');
export const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || (isDev ? 'tubo_refresh_secret_key_2026_dev_safe' : '');

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role?: 'admin' | 'member';
}

export async function createContext({ req, res }: CreateExpressContextOptions) {
  let user: UserSession | null = null;
  let isTokenExpired = false;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
      };
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        isTokenExpired = true;
      }
    }
  }

  return {
    req,
    res,
    user,
    isTokenExpired,
    pgDb,
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;

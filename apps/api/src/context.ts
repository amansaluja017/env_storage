import { inferAsyncReturnType } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import jwt from 'jsonwebtoken';
import { pgDb } from '@tubo/db';

export const JWT_SECRET = process.env.JWT_SECRET || 'tubo_secret_key_2026_safe';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'tubo_refresh_secret_key_2026_safe';

export interface UserSession {
  id: string;
  email: string;
  name: string;
}



export async function createContext({ req, res }: CreateExpressContextOptions) {
  let user: UserSession | null = null;
  let isTokenExpired = false;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as UserSession;
      user = { id: decoded.id, email: decoded.email, name: decoded.name };
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


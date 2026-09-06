import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.isTokenExpired) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'TOKEN_EXPIRED',
    });
  }
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action',
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Role middleware: Verifies the authenticated user has one of the allowed roles
 */
export function requireUserRole(allowedRoles: ('admin' | 'member')[]) {
  return t.middleware(({ ctx, next }) => {
    if (ctx.isTokenExpired) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'TOKEN_EXPIRED',
      });
    }
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to perform this action',
      });
    }
    if (!ctx.user.role || !allowedRoles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Access Denied: Requires one of the following roles: [${allowedRoles.join(', ')}]`,
      });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });
}

export const adminProcedure = protectedProcedure.use(requireUserRole(['admin']));


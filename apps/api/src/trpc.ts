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

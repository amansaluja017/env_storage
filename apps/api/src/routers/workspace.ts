import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { dataStore } from '../storage/store.js';

export const workspaceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const list = await dataStore.getWorkspacesForUser(ctx.user.id);
    return list;
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2),
        slug: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const newWs = await dataStore.createWorkspace({
        name: input.name,
        slug,
        ownerId: ctx.user.id,
      });
      return newWs;
    }),
});

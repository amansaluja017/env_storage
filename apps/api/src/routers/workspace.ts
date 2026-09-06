import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { dataStore } from '../storage/store.js';
import { TRPCError } from '@trpc/server';

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

  rename: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(2, 'Workspace name must be at least 2 characters'),
        slug: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const updated = await dataStore.renameWorkspace(
          input.workspaceId,
          input.name,
          input.slug,
          ctx.user.id
        );
        return updated;
      } catch (err: any) {
        throw new TRPCError({
          code: err.message?.includes('Access Denied') ? 'FORBIDDEN' : 'BAD_REQUEST',
          message: err.message || 'Failed to rename workspace',
        });
      }
    }),

  delete: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await dataStore.deleteWorkspace(input.workspaceId, ctx.user.id);
        return {
          success: true,
          message: 'Workspace deleted successfully',
        };
      } catch (err: any) {
        throw new TRPCError({
          code: err.message?.includes('Access Denied') ? 'FORBIDDEN' : 'BAD_REQUEST',
          message: err.message || 'Failed to delete workspace',
        });
      }
    }),
});


import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { dataStore } from '../storage/store.js';
import { TRPCError } from '@trpc/server';
import { pgDb, folders, eq } from '@tubo/db';

export const folderRouter = router({
  /**
   * List all folders for a team and environment from PostgreSQL
   */
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        teamId: z.string(),
        environment: z.enum(['development', 'staging', 'production']),
      })
    )
    .query(async ({ ctx, input }) => {
      const isMember = await dataStore.isUserInTeam(input.teamId, ctx.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: You are not a member of this team.',
        });
      }

      return await dataStore.getFolders(input.workspaceId, input.teamId, input.environment);
    }),

  /**
   * Create a folder in PostgreSQL
   */
  create: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        workspaceId: z.string(),
        teamId: z.string(),
        environment: z.enum(['development', 'staging', 'production']),
        name: z.string().min(1, 'Folder name cannot be empty'),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isMember = await dataStore.isUserInTeam(input.teamId, ctx.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: You cannot create folders in a team you do not belong to.',
        });
      }

      if (input.id) {
        const existing = await pgDb
          .select()
          .from(folders)
          .where(eq(folders.id, input.id));
        if (existing.length > 0) {
          const f = existing[0];
          if (f.teamId !== input.teamId || f.workspaceId !== input.workspaceId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Access Denied: Folder ID belongs to a different team or workspace.',
            });
          }
          const canModify = await dataStore.canUserModifyResource(
            input.teamId,
            ctx.user.id,
            ctx.user.role,
            f.createdById,
            f.createdBy
          );
          if (!canModify) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Access Denied: Only the creator of this folder or an admin can modify it.',
            });
          }
        }
      }

      return await dataStore.createFolder({
        id: input.id,
        workspaceId: input.workspaceId,
        teamId: input.teamId,
        environment: input.environment,
        name: input.name,
        description: input.description,
        createdBy: ctx.user.name || 'Team Member',
        createdById: ctx.user.id,
      });
    }),

  /**
   * Update a folder in PostgreSQL (creator or admin only)
   */
  update: protectedProcedure
    .input(
      z.object({
        folderId: z.string(),
        teamId: z.string(),
        name: z.string().min(1, 'Folder name cannot be empty'),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isMember = await dataStore.isUserInTeam(input.teamId, ctx.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: You cannot update folders in a team you do not belong to.',
        });
      }

      try {
        return await dataStore.updateFolder(
          input.folderId,
          input.teamId,
          input.name,
          input.description,
          ctx.user.id,
          ctx.user.role
        );
      } catch (err: any) {
        if (err.message?.includes('Access Denied')) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: err.message,
          });
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err.message || 'Failed to update folder',
        });
      }
    }),

  /**
   * Delete a folder from PostgreSQL (creator or admin only)
   */
  delete: protectedProcedure
    .input(
      z.object({
        folderId: z.string(),
        teamId: z.string(),
        deleteEnvs: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isMember = await dataStore.isUserInTeam(input.teamId, ctx.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: You cannot delete folders in a team you do not belong to.',
        });
      }

      try {
        return await dataStore.deleteFolder(
          input.folderId,
          input.teamId,
          input.deleteEnvs,
          ctx.user.id,
          ctx.user.role
        );
      } catch (err: any) {
        if (err.message?.includes('Access Denied')) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: err.message,
          });
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err.message || 'Failed to delete folder',
        });
      }
    }),
});

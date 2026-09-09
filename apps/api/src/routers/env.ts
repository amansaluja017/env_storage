import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { dataStore } from '../storage/store.js';
import { TRPCError } from '@trpc/server';

export const envRouter = router({
  info: protectedProcedure.query(async () => {
    return {
      message: 'Team-isolated environment variables stored in PostgreSQL with mobile SQLite local cache.',
      storageEngine: 'PostgreSQL Database (Neon / Cloud)',
    };
  }),

  /**
   * List environment variables for a team and environment (with optional folder filtering)
   */
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        teamId: z.string(),
        environment: z.enum(['development', 'staging', 'production']),
        folderId: z.string().nullable().optional(),
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

      return await dataStore.getEnvs(
        input.workspaceId,
        input.teamId,
        input.environment,
        input.folderId
      );
    }),

  /**
   * Upsert an environment variable in PostgreSQL
   */
  upsert: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        workspaceId: z.string(),
        teamId: z.string(),
        environment: z.enum(['development', 'staging', 'production']),
        folderId: z.string().nullable().optional(),
        key: z.string().min(1, 'Key name cannot be empty'),
        value: z.string(),
        isSecret: z.boolean().default(true),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isMember = await dataStore.isUserInTeam(input.teamId, ctx.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: You cannot add environment variables to a team you do not belong to.',
        });
      }

      try {
        return await dataStore.upsertEnv({
          id: input.id,
          workspaceId: input.workspaceId,
          teamId: input.teamId,
          environment: input.environment,
          folderId: input.folderId,
          key: input.key.toUpperCase().trim(),
          value: input.value,
          isSecret: input.isSecret,
          comment: input.comment,
          createdBy: ctx.user.name || 'Team Member',
          createdById: ctx.user.id,
          userId: ctx.user.id,
          userRole: ctx.user.role,
        });
      } catch (err: any) {
        if (err.message?.includes('Access Denied')) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: err.message,
          });
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err.message || 'Failed to save environment variable',
        });
      }
    }),

  /**
   * Delete an environment variable from PostgreSQL (creator or admin only)
   */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        teamId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isMember = await dataStore.isUserInTeam(input.teamId, ctx.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: You cannot delete environment variables from a team you do not belong to.',
        });
      }

      try {
        return await dataStore.deleteEnv(input.id, input.teamId, ctx.user.id, ctx.user.role);
      } catch (err: any) {
        if (err.message?.includes('Access Denied')) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: err.message,
          });
        }
        if (err.message?.toLowerCase().includes('not found')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: err.message,
          });
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err.message || 'Failed to delete environment variable',
        });
      }
    }),

  /**
   * Bulk import raw .env entries into PostgreSQL
   */
  bulkImport: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        teamId: z.string(),
        environment: z.enum(['development', 'staging', 'production']),
        folderId: z.string().nullable().optional(),
        rawDotEnv: z.string().min(1, 'Raw .env content cannot be empty').max(65536, 'Raw .env content exceeds maximum limit of 64KB'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isMember = await dataStore.isUserInTeam(input.teamId, ctx.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: You cannot import variables into a team you do not belong to.',
        });
      }

      return await dataStore.bulkImportEnvs(
        input.workspaceId,
        input.teamId,
        input.environment,
        input.folderId,
        input.rawDotEnv,
        ctx.user.name || 'Team Member',
        ctx.user.id,
        ctx.user.role
      );
    }),

  /**
   * Export environment variables as a compressed ZIP archive
   */
  exportZip: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        teamId: z.string(),
        environment: z.enum(['development', 'staging', 'production']),
        folderIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isMember = await dataStore.isUserInTeam(input.teamId, ctx.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: You cannot export variables from a team you do not belong to.',
        });
      }

      const result = await dataStore.exportEnvsAsZip({
        workspaceId: input.workspaceId,
        teamId: input.teamId,
        environment: input.environment,
        folderIds: input.folderIds,
      });

      return {
        fileName: result.fileName,
        base64: result.base64,
        folderCount: result.folderCount,
        envCount: result.envCount,
      };
    }),
});

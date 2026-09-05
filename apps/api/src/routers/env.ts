import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { dataStore } from '../storage/store.js';
import { TRPCError } from '@trpc/server';

export const envRouter = router({
  info: protectedProcedure.query(async () => {
    return {
      message: 'Team-isolated environment variables in-memory runtime store (No database).',
      storageEngine: 'In-Memory Runtime Store (No DB)',
    };
  }),

  /**
   * List environment variables for a team.
   * STRICT ACCESS CONTROL: Only members of the target team can see its environment variables!
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
      // 1. Verify user is in this team!
      const isMember = await dataStore.isUserInTeam(input.teamId, ctx.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: You are not a member of this team. Environment variables are restricted to team members.',
        });
      }

      // 2. Return variables strictly scoped to this team
      return await dataStore.getEnvs(input.workspaceId, input.teamId, input.environment);
    }),

  /**
   * Upsert an environment variable for a team.
   * Only members of the team can add/edit environment variables in that team.
   */
  upsert: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        workspaceId: z.string(),
        teamId: z.string(),
        environment: z.enum(['development', 'staging', 'production']),
        key: z.string().min(1, 'Key name cannot be empty'),
        value: z.string(),
        isSecret: z.boolean().default(true),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Verify user is in this team!
      const isMember = await dataStore.isUserInTeam(input.teamId, ctx.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: You cannot add environment variables to a team you do not belong to.',
        });
      }

      // 2. Save variable scoped to this team
      return await dataStore.upsertEnv({
        id: input.id,
        workspaceId: input.workspaceId,
        teamId: input.teamId,
        environment: input.environment,
        key: input.key.toUpperCase().trim(),
        value: input.value,
        isSecret: input.isSecret,
        comment: input.comment,
        createdBy: ctx.user.name || 'Team Member',
      });
    }),

  /**
   * Delete an environment variable for a team.
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

      return await dataStore.deleteEnv(input.id, input.teamId);
    }),
});

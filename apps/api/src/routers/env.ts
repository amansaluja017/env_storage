import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { envs } from '@tubo/db';
import { eq, and } from 'drizzle-orm';

export const envRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        teamId: z.string(),
        environment: z.enum(['development', 'staging', 'production']).default('development'),
      })
    )
    .query(async ({ ctx, input }) => {
      const results = ctx.sqliteDb
        .select()
        .from(envs)
        .where(
          and(
            eq(envs.workspaceId, input.workspaceId),
            eq(envs.teamId, input.teamId),
            eq(envs.environment, input.environment)
          )
        )
        .all();

      return results;
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        workspaceId: z.string(),
        teamId: z.string(),
        environment: z.enum(['development', 'staging', 'production']),
        key: z.string().min(1),
        value: z.string(),
        isSecret: z.boolean().default(true),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString();
      const id = input.id || 'env_' + Math.random().toString(36).substring(2, 10);

      // Check existing key in team/environment
      const existing = ctx.sqliteDb
        .select()
        .from(envs)
        .where(
          and(
            eq(envs.workspaceId, input.workspaceId),
            eq(envs.teamId, input.teamId),
            eq(envs.environment, input.environment),
            eq(envs.key, input.key)
          )
        )
        .get();

      if (existing || input.id) {
        const targetId = input.id || existing?.id || id;
        ctx.sqliteDb
          .update(envs)
          .set({
            value: input.value,
            isSecret: input.isSecret,
            comment: input.comment || null,
            updatedAt: now,
          })
          .where(eq(envs.id, targetId))
          .run();

        return { id: targetId, action: 'updated' };
      } else {
        ctx.sqliteDb
          .insert(envs)
          .values({
            id,
            workspaceId: input.workspaceId,
            teamId: input.teamId,
            environment: input.environment,
            key: input.key,
            value: input.value,
            isSecret: input.isSecret,
            comment: input.comment || null,
            createdBy: ctx.user.name,
            createdAt: now,
            updatedAt: now,
          })
          .run();

        return { id, action: 'created' };
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      ctx.sqliteDb.delete(envs).where(eq(envs.id, input.id)).run();
      return { success: true, id: input.id };
    }),

  bulkImport: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        teamId: z.string(),
        environment: z.enum(['development', 'staging', 'production']),
        rawDotEnvContent: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const lines = input.rawDotEnvContent.split('\n');
      const now = new Date().toISOString();
      let importedCount = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const key = trimmed.substring(0, eqIdx).trim();
        let value = trimmed.substring(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        const id = 'env_' + Math.random().toString(36).substring(2, 10);
        ctx.sqliteDb
          .insert(envs)
          .values({
            id,
            workspaceId: input.workspaceId,
            teamId: input.teamId,
            environment: input.environment,
            key,
            value,
            isSecret: true,
            comment: 'Imported via bulk upload',
            createdBy: ctx.user.name,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        importedCount++;
      }

      return { importedCount };
    }),
});

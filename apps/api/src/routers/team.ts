import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { dataStore } from '../storage/store.js';

export const teamRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ input }) => {
      const teams = await dataStore.getTeamsForWorkspace(input.workspaceId);
      return teams;
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(2),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const team = await dataStore.createTeam({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        ownerId: ctx.user.id,
      });
      return team;
    }),

  getMembers: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ input }) => {
      const members = await dataStore.getTeamMembers(input.teamId);
      return members;
    }),

  inviteMember: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        workspaceId: z.string(),
        email: z.string().email(),
        role: z.enum(['admin', 'member']).default('member'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invite = await dataStore.createInvite({
        teamId: input.teamId,
        workspaceId: input.workspaceId,
        email: input.email,
        role: input.role,
        invitedBy: ctx.user.id,
      });
      return invite;
    }),

  getInvites: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ input }) => {
      const invites = await dataStore.getInvitesForTeam(input.teamId);
      return invites;
    }),

  acceptInvite: protectedProcedure
    .input(z.object({ inviteCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const member = await dataStore.acceptInvite(
        input.inviteCode,
        ctx.user.id,
        ctx.user.name,
        ctx.user.email
      );
      return member;
    }),
});

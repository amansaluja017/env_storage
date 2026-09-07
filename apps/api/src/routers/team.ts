import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { dataStore } from '../storage/store.js';
import { TRPCError } from '@trpc/server';
import { sendTeamInvitationEmail, getPublicBaseUrl } from '../services/emailService.js';

export const teamRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const teams = await dataStore.getTeamsForUser(input.workspaceId, ctx.user.id);
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
      // Permission check: only workspace admins can create teams
      const isAllowed = await dataStore.isWorkspaceAdmin(input.workspaceId, ctx.user.id);
      if (!isAllowed) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: Only workspace admins have permission to create teams.',
        });
      }

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
    .query(async ({ ctx, input }) => {
      const isMember = await dataStore.isUserInTeam(input.teamId, ctx.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: You are not a member of this team.',
        });
      }
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
      const team = await dataStore.getTeamById(input.teamId);
      if (!team || team.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Specified team does not exist or does not belong to this workspace.',
        });
      }

      const isWsAdmin = await dataStore.isWorkspaceAdmin(input.workspaceId, ctx.user.id);
      const role = await dataStore.getUserRoleInTeam(input.teamId, ctx.user.id);
      if (!isWsAdmin && (!role || role !== 'admin')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: Only team admins and workspace admins can invite new members.',
        });
      }

      const ws = await dataStore.getWorkspaceById(input.workspaceId);

      const invite = await dataStore.createInvite({
        teamId: input.teamId,
        workspaceId: input.workspaceId,
        email: input.email.toLowerCase().trim(),
        role: input.role,
        invitedBy: ctx.user.id,
      });

      const apiHost = getPublicBaseUrl(ctx.req);
      const inviteUrl = `${apiHost}/auth/accept-invite?token=${invite.inviteCode}`;

      await sendTeamInvitationEmail(
        input.email.toLowerCase().trim(),
        inviteUrl,
        team?.name || 'Team',
        ws?.name || 'Workspace',
        ctx.user.name
      ).catch(err => console.warn('Failed to send invitation email:', err?.message || err));

      return invite;
    }),

  getInvites: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      const isMember = await dataStore.isUserInTeam(input.teamId, ctx.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: You are not a member of this team.',
        });
      }

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

  updateMemberRole: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        memberId: z.string(),
        role: z.enum(['admin', 'member']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Authorization: caller must be team admin or workspace admin
      const callerRole = await dataStore.getUserRoleInTeam(input.teamId, ctx.user.id);
      const team = await dataStore.getTeamById(input.teamId);
      const isWsAdmin = team ? await dataStore.isWorkspaceAdmin(team.workspaceId, ctx.user.id) : false;

      if (!isWsAdmin && (!callerRole || callerRole !== 'admin')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: Only team admins or workspace admins can change member roles.',
        });
      }

      // 2. Target member check
      const target = await dataStore.getTeamMemberById(input.teamId, input.memberId);
      if (!target) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Member not found in this team.',
        });
      }

      // 3. Protection: cannot alter the workspace owner's role
      const ws = team ? await dataStore.getWorkspaceById(team.workspaceId) : null;
      if (ws && ws.ownerId === target.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify the role of the workspace owner.',
        });
      }

      const updated = await dataStore.updateTeamMemberRole(input.teamId, input.memberId, input.role);
      return updated;
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        memberId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Authorization: caller must be team admin or workspace admin
      const callerRole = await dataStore.getUserRoleInTeam(input.teamId, ctx.user.id);
      const team = await dataStore.getTeamById(input.teamId);
      const isWsAdmin = team ? await dataStore.isWorkspaceAdmin(team.workspaceId, ctx.user.id) : false;

      if (!isWsAdmin && (!callerRole || callerRole !== 'admin')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access Denied: Only team admins or workspace admins can remove members.',
        });
      }

      // 2. Target member check
      const target = await dataStore.getTeamMemberById(input.teamId, input.memberId);
      if (!target) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Member not found in this team.',
        });
      }

      // 3. Protection: cannot remove the workspace owner
      const wsForRemove = team ? await dataStore.getWorkspaceById(team.workspaceId) : null;
      if (wsForRemove && wsForRemove.ownerId === target.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove the workspace owner from the team.',
        });
      }

      const success = await dataStore.removeTeamMember(input.teamId, input.memberId);
      return { success };
    }),

  rename: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        name: z.string().min(2, 'Team name must be at least 2 characters'),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const updated = await dataStore.renameTeam(
          input.teamId,
          input.name,
          input.description,
          ctx.user.id
        );
        return updated;
      } catch (err: any) {
        throw new TRPCError({
          code: err.message?.includes('Access Denied') ? 'FORBIDDEN' : 'BAD_REQUEST',
          message: err.message || 'Failed to rename team',
        });
      }
    }),

  delete: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await dataStore.deleteTeam(input.teamId, ctx.user.id);
        return {
          success: true,
          message: 'Team deleted successfully',
        };
      } catch (err: any) {
        throw new TRPCError({
          code: err.message?.includes('Access Denied') ? 'FORBIDDEN' : 'BAD_REQUEST',
          message: err.message || 'Failed to delete team',
        });
      }
    }),
});

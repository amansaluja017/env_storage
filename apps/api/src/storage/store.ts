import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  pgDb,
  users,
  workspaces,
  workspaceMembers,
  teams,
  teamMembers,
  teamInvites,
  folders,
  envs,
  eq,
  and,
  or,
  sql,
  isNull,
  inArray,
} from '@tubo/db';
import { tokenStore } from './tokenStore.js';

export interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: Date;
}

export interface TeamItem {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  createdBy?: string;
  createdAt: Date;
}

export interface TeamMemberItem {
  id: string;
  teamId: string;
  userId: string;
  role: 'admin' | 'member';
  joinedAt: Date;
  userName?: string;
  userEmail?: string;
  userRole?: 'admin' | 'member';
  isWorkspaceOwner?: boolean;
}

export interface TeamInviteItem {
  id: string;
  teamId: string;
  workspaceId: string;
  email: string;
  role: 'admin' | 'member';
  inviteCode: string;
  status: 'pending' | 'accepted' | 'expired';
  invitedBy: string;
  createdAt: Date;
}

export interface FolderItem {
  id: string;
  workspaceId: string;
  teamId: string;
  environment: 'development' | 'staging' | 'production';
  name: string;
  description?: string;
  createdBy: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  envCount?: number;
}

export interface EnvItem {
  id: string;
  workspaceId: string;
  teamId: string;
  environment: 'development' | 'staging' | 'production';
  folderId?: string | null;
  folderName?: string;
  key: string;
  value: string;
  isSecret: boolean;
  comment?: string;
  createdBy: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
}

export const dataStore = {
  // WORKSPACES - Strictly from PostgreSQL
  async getWorkspacesForUser(userId: string): Promise<WorkspaceItem[]> {
    // 1. Workspaces directly owned by user
    const owned = await pgDb.select().from(workspaces).where(eq(workspaces.ownerId, userId));

    // 2. Workspaces where user is a team member
    const userTeams = await pgDb
      .select({ workspaceId: teams.workspaceId })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, userId));

    const workspaceIds = new Set(owned.map(w => w.id));
    for (const ut of userTeams) {
      workspaceIds.add(ut.workspaceId);
    }

    if (workspaceIds.size === 0) return [];

    const all = await pgDb
      .select()
      .from(workspaces)
      .where(inArray(workspaces.id, Array.from(workspaceIds)));

    return all.map(r => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      ownerId: r.ownerId,
      createdAt: r.createdAt,
    }));
  },

  async createWorkspace(ws: { name: string; slug: string; ownerId: string }): Promise<WorkspaceItem> {
    const newItem: WorkspaceItem = {
      id: crypto.randomUUID(),
      name: ws.name,
      slug: ws.slug,
      ownerId: ws.ownerId,
      createdAt: new Date(),
    };

    const defaultTeam = {
      id: crypto.randomUUID(),
      workspaceId: newItem.id,
      name: 'General Team',
      description: 'Default team for ' + ws.name,
      createdBy: ws.ownerId,
      createdAt: new Date(),
    };

    await pgDb.transaction(async (tx) => {
      await tx.insert(workspaces).values(newItem);
      await tx.insert(teams).values(defaultTeam);
      await tx.insert(teamMembers).values({
        id: crypto.randomUUID(),
        teamId: defaultTeam.id,
        userId: ws.ownerId,
        role: 'admin',
        joinedAt: new Date(),
      });
    });

    return newItem;
  },

  async renameWorkspace(workspaceId: string, name: string, slug: string | undefined, userId: string): Promise<WorkspaceItem> {
    const ws = await pgDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (ws.length === 0) {
      throw new Error('Workspace not found.');
    }
    if (ws[0].ownerId !== userId) {
      throw new Error('Access Denied: Only the workspace creator can rename this workspace.');
    }

    const trimmedName = name.trim();
    const finalSlug = slug?.trim() || trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const updated = await pgDb
      .update(workspaces)
      .set({
        name: trimmedName,
        slug: finalSlug,
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    const r = updated[0];
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      ownerId: r.ownerId,
      createdAt: r.createdAt,
    };
  },

  async deleteWorkspace(workspaceId: string, userId: string): Promise<boolean> {
    const ws = await pgDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (ws.length === 0) {
      throw new Error('Workspace not found.');
    }
    if (ws[0].ownerId !== userId) {
      throw new Error('Access Denied: Only the workspace creator can delete this workspace.');
    }

    // Cascade delete in PostgreSQL handles teams, members, folders, envs, invites
    await pgDb.delete(workspaces).where(eq(workspaces.id, workspaceId));
    return true;
  },

  async getWorkspaceById(workspaceId: string): Promise<WorkspaceItem | null> {
    const ws = await pgDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (ws.length === 0) return null;
    const r = ws[0];
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      ownerId: r.ownerId,
      createdAt: r.createdAt,
    };
  },

  async isWorkspaceAdmin(workspaceId: string, userId: string): Promise<boolean> {
    // 1. Check if user is the owner of the workspace
    const ws = await pgDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (ws.length > 0 && ws[0].ownerId === userId) {
      return true;
    }

    // 2. Check if user is an admin or owner in workspace_members
    const wsMember = await pgDb
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
    if (wsMember.length > 0 && (wsMember[0].role === 'admin' || wsMember[0].role === 'owner')) {
      return true;
    }

    return false;
  },

  // TEAMS - Strictly from PostgreSQL
  async isUserInTeam(teamId: string, userId: string): Promise<boolean> {
    // 1. Direct team membership
    const member = await pgDb
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    if (member.length > 0) return true;

    // 2. Check if user is owner of the workspace containing the team
    const teamRes = await pgDb.select().from(teams).where(eq(teams.id, teamId));
    if (teamRes.length > 0) {
      const ws = await pgDb.select().from(workspaces).where(eq(workspaces.id, teamRes[0].workspaceId));
      if (ws.length > 0 && ws[0].ownerId === userId) return true;
    }

    return false;
  },

  async getUserRoleInTeam(teamId: string, userId: string): Promise<'owner' | 'admin' | 'member' | null> {
    const teamRes = await pgDb.select().from(teams).where(eq(teams.id, teamId));
    if (teamRes.length > 0) {
      const ws = await pgDb.select().from(workspaces).where(eq(workspaces.id, teamRes[0].workspaceId));
      if (ws.length > 0 && ws[0].ownerId === userId) return 'admin';
    }

    const member = await pgDb
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    if (member.length > 0) {
      return member[0].role;
    }

    return null;
  },

  async canUserModifyResource(
    teamId: string,
    userId: string,
    userGlobalRole?: string,
    resourceCreatedById?: string | null,
    resourceCreatedByName?: string | null
  ): Promise<boolean> {
    // 1. Direct creator check by user UUID
    if (resourceCreatedById && resourceCreatedById === userId) {
      return true;
    }

    // 2. Direct creator check fallback by name or user id
    if (resourceCreatedByName) {
      if (resourceCreatedByName === userId) return true;
      const userRes = await pgDb
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, userId));
      if (userRes.length > 0 && userRes[0].name && resourceCreatedByName === userRes[0].name) {
        return true;
      }
    }

    // 3. Team & Workspace ownership check
    const teamRes = await pgDb.select().from(teams).where(eq(teams.id, teamId));
    if (teamRes.length > 0) {
      // Team creator
      if (teamRes[0].createdBy === userId) return true;

      // Workspace owner
      const ws = await pgDb.select().from(workspaces).where(eq(workspaces.id, teamRes[0].workspaceId));
      if (ws.length > 0 && ws[0].ownerId === userId) return true;
    }

    // 4. Team membership role check (admin or owner in team_members)
    const member = await pgDb
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    if (member.length > 0 && (member[0].role === 'admin' || (member[0].role as string) === 'owner')) {
      return true;
    }

    return false;
  },

  async getTeamsForUser(workspaceId: string, userId: string): Promise<TeamItem[]> {
    // Check if user is workspace owner (owners see all teams in workspace)
    const ws = await pgDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    const isOwner = ws.length > 0 && ws[0].ownerId === userId;

    if (isOwner) {
      const allTeams = await pgDb.select().from(teams).where(eq(teams.workspaceId, workspaceId));
      return allTeams.map(t => ({
        id: t.id,
        workspaceId: t.workspaceId,
        name: t.name,
        description: t.description ?? undefined,
        createdBy: t.createdBy ?? undefined,
        createdAt: t.createdAt,
      }));
    }

    // Regular members only see teams they are actively enrolled in
    const userTeams = await pgDb
      .select({
        id: teams.id,
        workspaceId: teams.workspaceId,
        name: teams.name,
        description: teams.description,
        createdBy: teams.createdBy,
        createdAt: teams.createdAt,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(and(eq(teams.workspaceId, workspaceId), eq(teamMembers.userId, userId)));

    return userTeams.map(t => ({
      id: t.id,
      workspaceId: t.workspaceId,
      name: t.name,
      description: t.description ?? undefined,
      createdBy: t.createdBy ?? undefined,
      createdAt: t.createdAt,
    }));
  },

  async getTeamsForWorkspace(workspaceId: string): Promise<TeamItem[]> {
    const res = await pgDb.select().from(teams).where(eq(teams.workspaceId, workspaceId));
    return res.map(t => ({
      id: t.id,
      workspaceId: t.workspaceId,
      name: t.name,
      description: t.description ?? undefined,
      createdBy: t.createdBy ?? undefined,
      createdAt: t.createdAt,
    }));
  },

  async createTeam(t: { workspaceId: string; name: string; description?: string; ownerId: string }): Promise<TeamItem> {
    const newTeam = {
      id: crypto.randomUUID(),
      workspaceId: t.workspaceId,
      name: t.name,
      description: t.description || null,
      createdBy: t.ownerId,
      createdAt: new Date(),
    };

    await pgDb.transaction(async (tx) => {
      await tx.insert(teams).values(newTeam);
      await tx.insert(teamMembers).values({
        id: crypto.randomUUID(),
        teamId: newTeam.id,
        userId: t.ownerId,
        role: 'admin',
        joinedAt: new Date(),
      });
    });

    return {
      id: newTeam.id,
      workspaceId: newTeam.workspaceId,
      name: newTeam.name,
      description: newTeam.description ?? undefined,
      createdBy: newTeam.createdBy,
      createdAt: newTeam.createdAt,
    };
  },

  async renameTeam(
    teamId: string,
    name: string,
    description: string | undefined,
    userId: string
  ): Promise<TeamItem> {
    const teamRes = await pgDb.select().from(teams).where(eq(teams.id, teamId));
    if (teamRes.length === 0) {
      throw new Error('Team not found.');
    }
    const team = teamRes[0];

    // Check authorization: must be team creator or workspace owner
    const ws = await pgDb.select().from(workspaces).where(eq(workspaces.id, team.workspaceId));
    const isWsOwner = ws.length > 0 && ws[0].ownerId === userId;
    const isTeamCreator = team.createdBy === userId;

    if (!isTeamCreator && !isWsOwner) {
      throw new Error('Access Denied: Only the team creator or workspace owner can rename this team.');
    }

    const trimmedName = name.trim();
    const trimmedDesc = description?.trim() || null;

    const updated = await pgDb
      .update(teams)
      .set({
        name: trimmedName,
        description: trimmedDesc,
      })
      .where(eq(teams.id, teamId))
      .returning();

    const t = updated[0];
    return {
      id: t.id,
      workspaceId: t.workspaceId,
      name: t.name,
      description: t.description ?? undefined,
      createdBy: t.createdBy ?? undefined,
      createdAt: t.createdAt,
    };
  },

  async deleteTeam(teamId: string, userId: string): Promise<boolean> {
    const teamRes = await pgDb.select().from(teams).where(eq(teams.id, teamId));
    if (teamRes.length === 0) {
      throw new Error('Team not found.');
    }
    const team = teamRes[0];

    // Check authorization: must be team creator or workspace owner
    const ws = await pgDb.select().from(workspaces).where(eq(workspaces.id, team.workspaceId));
    const isWsOwner = ws.length > 0 && ws[0].ownerId === userId;
    const isTeamCreator = team.createdBy === userId;

    if (!isTeamCreator && !isWsOwner) {
      throw new Error('Access Denied: Only the team creator or workspace owner can delete this team.');
    }

    // Cascade delete in PostgreSQL handles members, folders, envs, invites
    await pgDb.delete(teams).where(eq(teams.id, teamId));
    return true;
  },

  // TEAM MEMBERS - Strictly from PostgreSQL with User joins
  async getTeamMembers(teamId: string): Promise<TeamMemberItem[]> {
    const res = await pgDb
      .select({
        id: teamMembers.id,
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(teamMembers)
      .leftJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId));

    // Also get the workspace owner id for this team
    const teamRes = await pgDb
      .select({ ownerId: workspaces.ownerId })
      .from(teams)
      .innerJoin(workspaces, eq(teams.workspaceId, workspaces.id))
      .where(eq(teams.id, teamId));
    const workspaceOwnerId = teamRes[0]?.ownerId;

    return res.map(r => {
      const isWsOwner = Boolean(workspaceOwnerId && workspaceOwnerId === r.userId);
      // Effective role: workspace owner or team admin is admin
      const effectiveRole: 'admin' | 'member' = (isWsOwner || r.role === 'admin')
        ? 'admin'
        : 'member';

      return {
        id: r.id,
        teamId: r.teamId,
        userId: r.userId,
        role: effectiveRole,
        joinedAt: r.joinedAt,
        userName: r.userName || undefined,
        userEmail: r.userEmail || undefined,
        userRole: effectiveRole,
        isWorkspaceOwner: isWsOwner,
      };
    });
  },

  async getTeamById(teamId: string): Promise<TeamItem | null> {
    const res = await pgDb.select().from(teams).where(eq(teams.id, teamId));
    if (res.length === 0) return null;
    const t = res[0];
    return {
      id: t.id,
      workspaceId: t.workspaceId,
      name: t.name,
      description: t.description ?? undefined,
      createdAt: t.createdAt,
    };
  },

  async getTeamMemberById(teamId: string, memberId: string): Promise<TeamMemberItem | null> {
    const res = await pgDb
      .select({
        id: teamMembers.id,
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(teamMembers)
      .leftJoin(users, eq(teamMembers.userId, users.id))
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, memberId)));
    if (res.length === 0) return null;
    const r = res[0];
    return {
      id: r.id,
      teamId: r.teamId,
      userId: r.userId,
      role: r.role,
      joinedAt: r.joinedAt,
      userName: r.userName || undefined,
      userEmail: r.userEmail || undefined,
    };
  },

  async updateTeamMemberRole(
    teamId: string,
    memberId: string,
    role: 'admin' | 'member'
  ): Promise<TeamMemberItem | null> {
    const updated = await pgDb
      .update(teamMembers)
      .set({ role })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, memberId)))
      .returning();

    if (updated.length === 0) return null;
    const r = updated[0];
    const u = await pgDb.select().from(users).where(eq(users.id, r.userId));
    return {
      id: r.id,
      teamId: r.teamId,
      userId: r.userId,
      role: r.role,
      joinedAt: r.joinedAt,
      userName: u[0]?.name,
      userEmail: u[0]?.email,
    };
  },

  async removeTeamMember(teamId: string, memberId: string): Promise<boolean> {
    const res = await pgDb
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, memberId)))
      .returning();
    return res.length > 0;
  },

  // INVITES - Strictly from PostgreSQL
  async createInvite(inv: {
    teamId: string;
    workspaceId: string;
    email: string;
    role: 'admin' | 'member';
    invitedBy: string;
  }): Promise<TeamInviteItem> {
    const code = 'INV-TUBO-' + crypto.randomBytes(16).toString('hex').toUpperCase();
    const newInvite = {
      id: crypto.randomUUID(),
      teamId: inv.teamId,
      workspaceId: inv.workspaceId,
      email: inv.email.toLowerCase().trim(),
      role: inv.role,
      inviteCode: code,
      status: 'pending' as const,
      invitedBy: inv.invitedBy,
      createdAt: new Date(),
    };
    await pgDb.insert(teamInvites).values(newInvite);
    // Persist inviteToken in tokens table with strict 1-hour expiry
    await tokenStore.createToken({
      userId: inv.invitedBy,
      type: 'inviteToken',
      token: code,
      expiresInMs: 60 * 60 * 1000, // 1 hour
      metadata: { teamId: inv.teamId, workspaceId: inv.workspaceId, email: inv.email, role: inv.role },
    }).catch(err => {
      console.warn('Failed to persist inviteToken in tokens table:', err?.message || err);
    });
    return newInvite;
  },

  async getInvitesForTeam(teamId: string): Promise<TeamInviteItem[]> {
    const res = await pgDb.select().from(teamInvites).where(eq(teamInvites.teamId, teamId));
    return res.map(r => ({
      id: r.id,
      teamId: r.teamId,
      workspaceId: r.workspaceId,
      email: r.email,
      role: r.role,
      inviteCode: r.inviteCode,
      status: r.status,
      invitedBy: r.invitedBy,
      createdAt: r.createdAt,
    }));
  },

  async findInviteDetails(inviteCode: string) {
    // 1. Check validity and 1-hour expiry via tokens table
    const tokenRecord = await tokenStore.findValidToken(inviteCode, 'inviteToken');
    if (!tokenRecord) {
      return null;
    }

    // 2. Fetch corresponding team_invites record
    const invites = await pgDb
      .select()
      .from(teamInvites)
      .where(eq(teamInvites.inviteCode, inviteCode));
    if (invites.length === 0 || invites[0].status !== 'pending') {
      return null;
    }
    const invite = invites[0];

    // 3. Fetch Team and Workspace
    const team = await this.getTeamById(invite.teamId);
    const workspace = await this.getWorkspaceById(invite.workspaceId);

    // 4. Check if a user with this email already exists
    const userRes = await pgDb
      .select()
      .from(users)
      .where(eq(users.email, invite.email.toLowerCase().trim()));
    const existingUser = userRes.length > 0 ? userRes[0] : null;

    return {
      invite,
      tokenRecord,
      team,
      workspace,
      existingUser,
    };
  },

  async completeInviteForExistingUser(inviteCode: string, user: { id: string; email: string; name: string }) {
    const details = await this.findInviteDetails(inviteCode);
    if (!details) {
      throw new Error('This invitation link is invalid, expired (valid for 1 hour), or has already been accepted.');
    }

    const { invite } = details;

    // Check if user is already in team
    const existingMember = await pgDb
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, invite.teamId), eq(teamMembers.userId, user.id)));

    await pgDb.transaction(async (tx) => {
      // 1. Mark invite as accepted
      await tx
        .update(teamInvites)
        .set({ status: 'accepted' })
        .where(eq(teamInvites.id, invite.id));

      // 2. Add to team_members if not yet a member
      if (existingMember.length === 0) {
        await tx.insert(teamMembers).values({
          id: crypto.randomUUID(),
          teamId: invite.teamId,
          userId: user.id,
          role: invite.role,
          joinedAt: new Date(),
        });
      }

      // 3. Add to workspace_members if not already present
      const existingWsMember = await tx
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, user.id)));
      if (existingWsMember.length === 0) {
        await tx.insert(workspaceMembers).values({
          id: crypto.randomUUID(),
          workspaceId: invite.workspaceId,
          userId: user.id,
          role: 'member',
          joinedAt: new Date(),
        });
      }
    });

    // Atomically consume token
    await tokenStore.consumeToken(inviteCode).catch(() => {});

    return {
      success: true,
      team: details.team,
      workspace: details.workspace,
    };
  },

  async completeInviteAndCreateUser(inviteCode: string, name: string, password: string) {
    const details = await this.findInviteDetails(inviteCode);
    if (!details) {
      throw new Error('This invitation link is invalid, expired (valid for 1 hour), or has already been accepted.');
    }

    const { invite } = details;
    const cleanEmail = invite.email.toLowerCase().trim();

    // Verify user doesn't already exist
    const existing = await pgDb.select().from(users).where(eq(users.email, cleanEmail));
    if (existing.length > 0) {
      return await this.completeInviteForExistingUser(inviteCode, existing[0]);
    }

    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUserId = crypto.randomUUID();

    await pgDb.transaction(async (tx) => {
      // 1. Create User
      await tx.insert(users).values({
        id: newUserId,
        email: cleanEmail,
        name: name.trim() || cleanEmail.split('@')[0],
        passwordHash,
      });

      // 2. Add to team_members
      await tx.insert(teamMembers).values({
        id: crypto.randomUUID(),
        teamId: invite.teamId,
        userId: newUserId,
        role: invite.role,
        joinedAt: new Date(),
      });

      // 3. Add to workspace_members
      await tx.insert(workspaceMembers).values({
        id: crypto.randomUUID(),
        workspaceId: invite.workspaceId,
        userId: newUserId,
        role: 'member',
        joinedAt: new Date(),
      });

      // 4. Mark invite as accepted
      await tx
        .update(teamInvites)
        .set({ status: 'accepted' })
        .where(eq(teamInvites.id, invite.id));
    });

    // Atomically consume token
    await tokenStore.consumeToken(inviteCode).catch(() => {});

    return {
      success: true,
      user: { id: newUserId, email: cleanEmail, name: name.trim() || cleanEmail.split('@')[0] },
      team: details.team,
      workspace: details.workspace,
    };
  },

  async acceptInvite(inviteCode: string, userId: string, userName?: string, userEmail?: string): Promise<TeamMemberItem> {
    // 1. Resolve authenticated user from DB to verify identity
    const userRes = await pgDb.select().from(users).where(eq(users.id, userId));
    if (userRes.length === 0) {
      throw new Error('Authenticated user not found in database.');
    }
    const u = userRes[0];

    // 2. Verify 1-hour expiry and token existence in tokens table
    const tokenRecord = await tokenStore.findValidToken(inviteCode, 'inviteToken');
    if (!tokenRecord) {
      throw new Error('This invitation link has expired (valid for 1 hour) or is invalid.');
    }

    // 3. Locate invite by code
    const invites = await pgDb
      .select()
      .from(teamInvites)
      .where(eq(teamInvites.inviteCode, inviteCode));

    if (invites.length === 0) {
      throw new Error('Invalid invite code');
    }
    const invite = invites[0];

    if (invite.status === 'expired') {
      throw new Error('This invite code has expired.');
    }
    if (invite.status !== 'pending') {
      throw new Error('This invite has already been accepted or is no longer pending.');
    }

    // 4. Bind acceptance to matching email
    if (invite.email.toLowerCase() !== u.email.toLowerCase()) {
      throw new Error(`This invite was issued for ${invite.email}, but you are logged in as ${u.email}.`);
    }

    const newMember = {
      id: crypto.randomUUID(),
      teamId: invite.teamId,
      userId: userId,
      role: invite.role,
      joinedAt: new Date(),
    };

    await pgDb.transaction(async (tx) => {
      await tx
        .update(teamInvites)
        .set({ status: 'accepted' })
        .where(eq(teamInvites.id, invite.id));

      await tx.insert(teamMembers).values(newMember);

      // Add to workspace_members if not present
      const existingWsMember = await tx
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, userId)));
      if (existingWsMember.length === 0) {
        await tx.insert(workspaceMembers).values({
          id: crypto.randomUUID(),
          workspaceId: invite.workspaceId,
          userId: userId,
          role: 'member',
          joinedAt: new Date(),
        });
      }
    });

    await tokenStore.consumeToken(inviteCode).catch(() => {});

    return {
      id: newMember.id,
      teamId: newMember.teamId,
      userId: newMember.userId,
      role: newMember.role,
      joinedAt: newMember.joinedAt,
      userName: u.name || userName || undefined,
      userEmail: u.email || userEmail || undefined,
    };
  },

  // FOLDERS - Strictly from PostgreSQL
  async getFolders(
    workspaceId: string,
    teamId: string,
    environment: 'development' | 'staging' | 'production'
  ): Promise<FolderItem[]> {
    const folderRows = await pgDb
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.workspaceId, workspaceId),
          eq(folders.teamId, teamId),
          eq(folders.environment, environment)
        )
      )
      .orderBy(folders.name);

    // Get count of envs per folder
    const envCounts = await pgDb
      .select({
        folderId: envs.folderId,
        count: sql<number>`count(*)`,
      })
      .from(envs)
      .where(
        and(
          eq(envs.workspaceId, workspaceId),
          eq(envs.teamId, teamId),
          eq(envs.environment, environment)
        )
      )
      .groupBy(envs.folderId);

    const countMap = new Map<string, number>();
    for (const row of envCounts) {
      if (row.folderId) {
        countMap.set(row.folderId, Number(row.count) || 0);
      }
    }

    return folderRows.map(f => ({
      id: f.id,
      workspaceId: f.workspaceId,
      teamId: f.teamId,
      environment: f.environment as 'development' | 'staging' | 'production',
      name: f.name,
      description: f.description || undefined,
      createdBy: f.createdBy,
      createdById: f.createdById ?? undefined,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
      envCount: countMap.get(f.id) || 0,
    }));
  },

  async createFolder(data: {
    id?: string;
    workspaceId: string;
    teamId: string;
    environment: 'development' | 'staging' | 'production';
    name: string;
    description?: string;
    createdBy: string;
    createdById?: string;
  }): Promise<FolderItem> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    const trimmedName = data.name.trim();

    await pgDb.insert(folders).values({
      id,
      workspaceId: data.workspaceId,
      teamId: data.teamId,
      environment: data.environment,
      name: trimmedName,
      description: data.description?.trim() || null,
      createdBy: data.createdBy,
      createdById: data.createdById || null,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: folders.id,
      set: {
        name: trimmedName,
        description: data.description?.trim() || null,
        updatedAt: now,
      },
    });

    return {
      id,
      workspaceId: data.workspaceId,
      teamId: data.teamId,
      environment: data.environment,
      name: trimmedName,
      description: data.description?.trim(),
      createdBy: data.createdBy,
      createdById: data.createdById,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      envCount: 0,
    };
  },

  async updateFolder(
    folderId: string,
    teamId: string,
    name: string,
    description: string | undefined,
    userId: string,
    userRole?: string
  ): Promise<FolderItem> {
    const existing = await pgDb
      .select()
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.teamId, teamId)));
    if (existing.length === 0) {
      throw new Error('Folder not found.');
    }

    const f = existing[0];
    const canModify = await this.canUserModifyResource(
      teamId,
      userId,
      userRole,
      f.createdById,
      f.createdBy
    );
    if (!canModify) {
      throw new Error('Access Denied: Only the creator of this folder or an admin can edit it.');
    }

    const trimmedName = name.trim();
    const now = new Date();
    await pgDb
      .update(folders)
      .set({
        name: trimmedName,
        description: description?.trim() || null,
        updatedAt: now,
      })
      .where(and(eq(folders.id, folderId), eq(folders.teamId, teamId)));

    return {
      id: f.id,
      workspaceId: f.workspaceId,
      teamId: f.teamId,
      environment: f.environment as 'development' | 'staging' | 'production',
      name: trimmedName,
      description: description?.trim(),
      createdBy: f.createdBy,
      createdById: f.createdById ?? undefined,
      createdAt: f.createdAt.toISOString(),
      updatedAt: now.toISOString(),
    };
  },

  async deleteFolder(
    folderId: string,
    teamId: string,
    deleteEnvs: boolean = false,
    userId?: string,
    userRole?: string
  ): Promise<boolean> {
    const existing = await pgDb
      .select()
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.teamId, teamId)));
    if (existing.length === 0) {
      throw new Error('Folder not found.');
    }

    if (userId) {
      const f = existing[0];
      const canModify = await this.canUserModifyResource(
        teamId,
        userId,
        userRole,
        f.createdById,
        f.createdBy
      );
      if (!canModify) {
        throw new Error('Access Denied: Only the creator of this folder or an admin can delete it.');
      }
    }

    if (deleteEnvs) {
      await pgDb.delete(envs).where(and(eq(envs.folderId, folderId), eq(envs.teamId, teamId)));
    } else {
      await pgDb
        .update(envs)
        .set({ folderId: null, updatedAt: new Date() })
        .where(and(eq(envs.folderId, folderId), eq(envs.teamId, teamId)));
    }
    await pgDb.delete(folders).where(and(eq(folders.id, folderId), eq(folders.teamId, teamId)));
    return true;
  },

  // ENVIRONMENT VARIABLES - Strictly from PostgreSQL
  async getEnvs(
    workspaceId: string,
    teamId: string,
    environment: 'development' | 'staging' | 'production',
    folderId?: string | null | 'all'
  ): Promise<EnvItem[]> {
    const conditions = [
      eq(envs.workspaceId, workspaceId),
      eq(envs.teamId, teamId),
      eq(envs.environment, environment),
    ];

    if (folderId && folderId !== 'all') {
      if (folderId === 'root') {
        conditions.push(isNull(envs.folderId));
      } else {
        conditions.push(eq(envs.folderId, folderId));
      }
    }

    const rows = await pgDb
      .select()
      .from(envs)
      .where(and(...conditions))
      .orderBy(envs.key);

    const folderRows = await pgDb
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(
        and(
          eq(folders.workspaceId, workspaceId),
          eq(folders.teamId, teamId),
          eq(folders.environment, environment)
        )
      );
    const folderNameMap = new Map(folderRows.map(f => [f.id, f.name]));

    return rows.map(r => ({
      id: r.id,
      workspaceId: r.workspaceId,
      teamId: r.teamId,
      environment: r.environment as 'development' | 'staging' | 'production',
      folderId: r.folderId || null,
      folderName: r.folderId ? folderNameMap.get(r.folderId) : undefined,
      key: r.key,
      value: r.value,
      isSecret: Boolean(r.isSecret),
      comment: r.comment || undefined,
      createdBy: r.createdBy,
      createdById: r.createdById ?? undefined,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  },

  async upsertEnv(data: {
    id?: string;
    workspaceId: string;
    teamId: string;
    environment: 'development' | 'staging' | 'production';
    folderId?: string | null;
    key: string;
    value: string;
    isSecret?: boolean;
    comment?: string;
    createdBy: string;
    createdById?: string;
    userId?: string;
    userRole?: string;
  }): Promise<EnvItem> {
    const now = new Date();
    const normalizedKey = data.key.toUpperCase().trim();
    const folderId = data.folderId || null;

    let targetId = data.id;
    if (!targetId) {
      const existing = await pgDb
        .select({ id: envs.id })
        .from(envs)
        .where(
          and(
            eq(envs.workspaceId, data.workspaceId),
            eq(envs.teamId, data.teamId),
            eq(envs.environment, data.environment),
            eq(envs.key, normalizedKey),
            folderId ? eq(envs.folderId, folderId) : isNull(envs.folderId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        targetId = existing[0].id;
      }
    }

    if (targetId) {
      const existingRow = await pgDb.select().from(envs).where(eq(envs.id, targetId));
      if (existingRow.length > 0 && data.userId) {
        const canModify = await this.canUserModifyResource(
          data.teamId,
          data.userId,
          data.userRole,
          existingRow[0].createdById,
          existingRow[0].createdBy
        );
        if (!canModify) {
          throw new Error('Access Denied: Only the creator of this variable or an admin can edit it.');
        }
      }
    }

    targetId = targetId || crypto.randomUUID();
    const effectiveCreatedById = data.createdById || data.userId || null;

    await pgDb
      .insert(envs)
      .values({
        id: targetId,
        workspaceId: data.workspaceId,
        teamId: data.teamId,
        environment: data.environment,
        folderId: folderId,
        key: normalizedKey,
        value: data.value,
        isSecret: data.isSecret !== undefined ? Boolean(data.isSecret) : true,
        comment: data.comment || null,
        createdBy: data.createdBy,
        createdById: effectiveCreatedById,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: envs.id,
        set: {
          workspaceId: data.workspaceId,
          teamId: data.teamId,
          environment: data.environment,
          folderId: folderId,
          key: normalizedKey,
          value: data.value,
          isSecret: data.isSecret !== undefined ? Boolean(data.isSecret) : true,
          comment: data.comment || null,
          updatedAt: now,
        },
      });

    return {
      id: targetId,
      workspaceId: data.workspaceId,
      teamId: data.teamId,
      environment: data.environment,
      folderId,
      key: normalizedKey,
      value: data.value,
      isSecret: data.isSecret !== undefined ? Boolean(data.isSecret) : true,
      comment: data.comment,
      createdBy: data.createdBy,
      createdById: effectiveCreatedById ?? undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  },

  async deleteEnv(id: string, teamId: string, userId?: string, userRole?: string): Promise<boolean> {
    const existing = await pgDb.select().from(envs).where(and(eq(envs.id, id), eq(envs.teamId, teamId)));
    if (existing.length === 0) {
      throw new Error('Environment variable not found.');
    }

    if (userId) {
      const canModify = await this.canUserModifyResource(
        teamId,
        userId,
        userRole,
        existing[0].createdById,
        existing[0].createdBy
      );
      if (!canModify) {
        throw new Error('Access Denied: Only the creator of this variable or an admin can delete it.');
      }
    }

    await pgDb.delete(envs).where(and(eq(envs.id, id), eq(envs.teamId, teamId)));
    return true;
  },

  async bulkImportEnvs(
    workspaceId: string,
    teamId: string,
    environment: 'development' | 'staging' | 'production',
    folderId: string | null | undefined,
    rawDotEnv: string,
    createdBy: string
  ): Promise<{ importedCount: number }> {
    const lines = rawDotEnv.split('\n');
    let importedCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;

      const key = trimmed.substring(0, eqIdx).trim().toUpperCase();
      let value = trimmed.substring(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }

      await this.upsertEnv({
        workspaceId,
        teamId,
        environment,
        folderId,
        key,
        value,
        isSecret: true,
        comment: 'Imported via Monorepo Cloud Sync',
        createdBy,
      });
      importedCount++;
    }

    return { importedCount };
  },
};

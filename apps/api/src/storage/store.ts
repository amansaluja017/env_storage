import { pgDb, users, workspaces, teams, teamMembers, teamInvites, eq, and, or } from '@tubo/db';

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
  createdAt: Date;
}

export interface TeamMemberItem {
  id: string;
  teamId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
  userName?: string;
  userEmail?: string;
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

export interface EnvItem {
  id: string;
  workspaceId: string;
  teamId: string;
  environment: 'development' | 'staging' | 'production';
  key: string;
  value: string;
  isSecret: boolean;
  comment?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// In-Memory runtime store for team-scoped environment variables (No SQLite / No DB)
const envsStore: EnvItem[] = [];

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

    const all = await pgDb.select().from(workspaces);
    return all
      .filter(w => workspaceIds.has(w.id))
      .map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        ownerId: r.ownerId,
        createdAt: r.createdAt,
      }));
  },

  async createWorkspace(ws: { name: string; slug: string; ownerId: string }): Promise<WorkspaceItem> {
    const newItem: WorkspaceItem = {
      id: 'ws_' + Math.random().toString(36).substring(2, 9),
      name: ws.name,
      slug: ws.slug,
      ownerId: ws.ownerId,
      createdAt: new Date(),
    };
    await pgDb.insert(workspaces).values(newItem);

    const defaultTeam = {
      id: 'team_' + Math.random().toString(36).substring(2, 9),
      workspaceId: newItem.id,
      name: 'General Team',
      description: 'Default team for ' + ws.name,
      createdAt: new Date(),
    };
    await pgDb.insert(teams).values(defaultTeam);

    await pgDb.insert(teamMembers).values({
      id: 'tm_' + Math.random().toString(36).substring(2, 9),
      teamId: defaultTeam.id,
      userId: ws.ownerId,
      role: 'owner',
      joinedAt: new Date(),
    });

    return newItem;
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
      createdAt: t.createdAt,
    }));
  },

  async createTeam(t: { workspaceId: string; name: string; description?: string; ownerId: string }): Promise<TeamItem> {
    const newTeam = {
      id: 'team_' + Math.random().toString(36).substring(2, 9),
      workspaceId: t.workspaceId,
      name: t.name,
      description: t.description || null,
      createdAt: new Date(),
    };
    await pgDb.insert(teams).values(newTeam);

    await pgDb.insert(teamMembers).values({
      id: 'tm_' + Math.random().toString(36).substring(2, 9),
      teamId: newTeam.id,
      userId: t.ownerId,
      role: 'owner',
      joinedAt: new Date(),
    });

    return {
      id: newTeam.id,
      workspaceId: newTeam.workspaceId,
      name: newTeam.name,
      description: newTeam.description ?? undefined,
      createdAt: newTeam.createdAt,
    };
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

    return res.map(r => ({
      id: r.id,
      teamId: r.teamId,
      userId: r.userId,
      role: r.role,
      joinedAt: r.joinedAt,
      userName: r.userName || undefined,
      userEmail: r.userEmail || undefined,
    }));
  },

  // INVITES - Strictly from PostgreSQL
  async createInvite(inv: {
    teamId: string;
    workspaceId: string;
    email: string;
    role: 'admin' | 'member';
    invitedBy: string;
  }): Promise<TeamInviteItem> {
    const code = 'INV-TUBO-' + Math.floor(1000 + Math.random() * 9000);
    const newInvite = {
      id: 'inv_' + Math.random().toString(36).substring(2, 9),
      teamId: inv.teamId,
      workspaceId: inv.workspaceId,
      email: inv.email,
      role: inv.role,
      inviteCode: code,
      status: 'pending' as const,
      invitedBy: inv.invitedBy,
      createdAt: new Date(),
    };
    await pgDb.insert(teamInvites).values(newInvite);
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

  async acceptInvite(inviteCode: string, userId: string, userName?: string, userEmail?: string): Promise<TeamMemberItem> {
    const invites = await pgDb
      .select()
      .from(teamInvites)
      .where(and(eq(teamInvites.inviteCode, inviteCode), eq(teamInvites.status, 'pending')));

    if (invites.length === 0) {
      throw new Error('Invalid or expired invite code');
    }
    const invite = invites[0];

    await pgDb
      .update(teamInvites)
      .set({ status: 'accepted' })
      .where(eq(teamInvites.id, invite.id));

    const newMember = {
      id: 'tm_' + Math.random().toString(36).substring(2, 9),
      teamId: invite.teamId,
      userId: userId,
      role: invite.role,
      joinedAt: new Date(),
    };
    await pgDb.insert(teamMembers).values(newMember);

    const userRes = await pgDb.select().from(users).where(eq(users.id, userId));
    const u = userRes[0];

    return {
      id: newMember.id,
      teamId: newMember.teamId,
      userId: newMember.userId,
      role: newMember.role,
      joinedAt: newMember.joinedAt,
      userName: u?.name || userName || undefined,
      userEmail: u?.email || userEmail || undefined,
    };
  },

  // ENVIRONMENT VARIABLES (In-Memory Runtime Store, No SQLite / No DB)
  async getEnvs(workspaceId: string, teamId: string, environment: 'development' | 'staging' | 'production'): Promise<EnvItem[]> {
    return envsStore.filter(
      e => e.workspaceId === workspaceId && e.teamId === teamId && e.environment === environment
    );
  },

  async upsertEnv(data: {
    id?: string;
    workspaceId: string;
    teamId: string;
    environment: 'development' | 'staging' | 'production';
    key: string;
    value: string;
    isSecret?: boolean;
    comment?: string;
    createdBy: string;
  }): Promise<EnvItem> {
    const now = new Date().toISOString();
    const existingIndex = data.id
      ? envsStore.findIndex(e => e.id === data.id)
      : envsStore.findIndex(
          e =>
            e.workspaceId === data.workspaceId &&
            e.teamId === data.teamId &&
            e.environment === data.environment &&
            e.key.toUpperCase() === data.key.toUpperCase()
        );

    if (existingIndex >= 0) {
      const existing = envsStore[existingIndex];
      const updated: EnvItem = {
        ...existing,
        key: data.key.toUpperCase().trim(),
        value: data.value,
        isSecret: data.isSecret !== undefined ? Boolean(data.isSecret) : existing.isSecret,
        comment: data.comment !== undefined ? data.comment : existing.comment,
        updatedAt: now,
      };
      envsStore[existingIndex] = updated;
      return updated;
    }

    const newEnv: EnvItem = {
      id: data.id || 'env_' + Math.random().toString(36).substring(2, 10),
      workspaceId: data.workspaceId,
      teamId: data.teamId,
      environment: data.environment,
      key: data.key.toUpperCase().trim(),
      value: data.value,
      isSecret: data.isSecret !== undefined ? Boolean(data.isSecret) : true,
      comment: data.comment,
      createdBy: data.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    envsStore.push(newEnv);
    return newEnv;
  },

  async deleteEnv(id: string, teamId: string): Promise<boolean> {
    const idx = envsStore.findIndex(e => e.id === id && e.teamId === teamId);
    if (idx >= 0) {
      envsStore.splice(idx, 1);
    }
    return true;
  },
};

import { pgDb, users, workspaces, workspaceMembers, teams, teamMembers, teamInvites, eq, and } from '@tubo/db';
import { memoryUsers } from '../context.js';

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

// Memory fallbacks in case Postgres DB is not yet initialized locally
const memoryWorkspaces: WorkspaceItem[] = [
  {
    id: 'ws_demo_main',
    name: 'Acme Corp Production',
    slug: 'acme-corp',
    ownerId: 'user_demo_123',
    createdAt: new Date(),
  },
  {
    id: 'ws_demo_personal',
    name: 'Personal Sandbox',
    slug: 'personal-sandbox',
    ownerId: 'user_demo_123',
    createdAt: new Date(),
  }
];

const memoryTeams: TeamItem[] = [
  {
    id: 'team_backend',
    workspaceId: 'ws_demo_main',
    name: 'Backend Core',
    description: 'API, Microservices & Database infra envs',
    createdAt: new Date(),
  },
  {
    id: 'team_frontend',
    workspaceId: 'ws_demo_main',
    name: 'Mobile & Web Apps',
    description: 'Expo Apps & Web dashboard envs',
    createdAt: new Date(),
  },
  {
    id: 'team_devops',
    workspaceId: 'ws_demo_main',
    name: 'DevOps & CI/CD',
    description: 'Docker, K8s, AWS keys',
    createdAt: new Date(),
  }
];

const memoryTeamMembers: TeamMemberItem[] = [
  {
    id: 'tm_1',
    teamId: 'team_backend',
    userId: 'user_demo_123',
    role: 'owner',
    joinedAt: new Date(),
    userName: 'Alex Vance',
    userEmail: 'alex@tubo.dev',
  },
  {
    id: 'tm_2',
    teamId: 'team_backend',
    userId: 'user_sarah_456',
    role: 'admin',
    joinedAt: new Date(),
    userName: 'Sarah Jenkins',
    userEmail: 'sarah@tubo.dev',
  },
  {
    id: 'tm_3',
    teamId: 'team_frontend',
    userId: 'user_demo_123',
    role: 'owner',
    joinedAt: new Date(),
    userName: 'Alex Vance',
    userEmail: 'alex@tubo.dev',
  }
];

const memoryTeamInvites: TeamInviteItem[] = [
  {
    id: 'inv_1',
    teamId: 'team_backend',
    workspaceId: 'ws_demo_main',
    email: 'dev@acme.io',
    role: 'member',
    inviteCode: 'INV-TUBO-9921',
    status: 'pending',
    invitedBy: 'user_demo_123',
    createdAt: new Date(),
  }
];

export const dataStore = {
  // WORKSPACES
  async getWorkspacesForUser(userId: string): Promise<WorkspaceItem[]> {
    try {
      const res = await pgDb.select().from(workspaces).where(eq(workspaces.ownerId, userId));
      if (res.length > 0) return res.map((r: any) => ({ ...r, createdAt: r.createdAt }));
    } catch (e) {
      // Fallback
    }
    return memoryWorkspaces.filter(w => w.ownerId === userId || true); // return sample workspaces for demo
  },

  async createWorkspace(ws: { name: string; slug: string; ownerId: string }): Promise<WorkspaceItem> {
    const newItem: WorkspaceItem = {
      id: 'ws_' + Math.random().toString(36).substring(2, 9),
      name: ws.name,
      slug: ws.slug,
      ownerId: ws.ownerId,
      createdAt: new Date(),
    };
    try {
      await pgDb.insert(workspaces).values(newItem);
    } catch (e) {
      // Fallback
    }
    memoryWorkspaces.push(newItem);
    // Also create default team for new workspace
    const defaultTeam: TeamItem = {
      id: 'team_' + Math.random().toString(36).substring(2, 9),
      workspaceId: newItem.id,
      name: 'General Team',
      description: 'Default team for ' + ws.name,
      createdAt: new Date(),
    };
    memoryTeams.push(defaultTeam);
    return newItem;
  },

  // TEAMS
  async getTeamsForWorkspace(workspaceId: string): Promise<TeamItem[]> {
    try {
      const res = await pgDb.select().from(teams).where(eq(teams.workspaceId, workspaceId));
      if (res.length > 0) return res.map((r: any) => ({ ...r, createdAt: r.createdAt, description: r.description ?? undefined }));
    } catch (e) {
      // Fallback
    }
    return memoryTeams.filter(t => t.workspaceId === workspaceId);
  },

  async createTeam(t: { workspaceId: string; name: string; description?: string; ownerId: string }): Promise<TeamItem> {
    const newTeam: TeamItem = {
      id: 'team_' + Math.random().toString(36).substring(2, 9),
      workspaceId: t.workspaceId,
      name: t.name,
      description: t.description,
      createdAt: new Date(),
    };
    try {
      await pgDb.insert(teams).values(newTeam);
    } catch (e) {
      // Fallback
    }
    memoryTeams.push(newTeam);

    // Add creator as member
    const ownerMember: TeamMemberItem = {
      id: 'tm_' + Math.random().toString(36).substring(2, 9),
      teamId: newTeam.id,
      userId: t.ownerId,
      role: 'owner',
      joinedAt: new Date(),
      userName: 'Team Owner',
    };
    memoryTeamMembers.push(ownerMember);

    return newTeam;
  },

  // TEAM MEMBERS
  async getTeamMembers(teamId: string): Promise<TeamMemberItem[]> {
    try {
      const res = await pgDb.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
      if (res.length > 0) return res.map((r: any) => ({ ...r, role: r.role, joinedAt: r.joinedAt }));
    } catch (e) {
      // Fallback
    }
    return memoryTeamMembers.filter(m => m.teamId === teamId);
  },

  // INVITES
  async createInvite(inv: { teamId: string; workspaceId: string; email: string; role: 'admin' | 'member'; invitedBy: string }): Promise<TeamInviteItem> {
    const code = 'INV-TUBO-' + Math.floor(1000 + Math.random() * 9000);
    const newInvite: TeamInviteItem = {
      id: 'inv_' + Math.random().toString(36).substring(2, 9),
      teamId: inv.teamId,
      workspaceId: inv.workspaceId,
      email: inv.email,
      role: inv.role,
      inviteCode: code,
      status: 'pending',
      invitedBy: inv.invitedBy,
      createdAt: new Date(),
    };
    try {
      await pgDb.insert(teamInvites).values(newInvite);
    } catch (e) {
      // Fallback
    }
    memoryTeamInvites.push(newInvite);
    return newInvite;
  },

  async getInvitesForTeam(teamId: string): Promise<TeamInviteItem[]> {
    try {
      const res = await pgDb.select().from(teamInvites).where(eq(teamInvites.teamId, teamId));
      if (res.length > 0) return res.map((r: any) => ({ ...r, role: r.role, status: r.status, createdAt: r.createdAt }));
    } catch (e) {
      // Fallback
    }
    return memoryTeamInvites.filter(i => i.teamId === teamId);
  },

  async acceptInvite(inviteCode: string, userId: string, userName: string, userEmail: string): Promise<TeamMemberItem> {
    const invite = memoryTeamInvites.find(i => i.inviteCode === inviteCode && i.status === 'pending');
    if (!invite) {
      throw new Error('Invalid or expired invite code');
    }
    invite.status = 'accepted';

    const newMember: TeamMemberItem = {
      id: 'tm_' + Math.random().toString(36).substring(2, 9),
      teamId: invite.teamId,
      userId: userId,
      role: invite.role,
      joinedAt: new Date(),
      userName: userName,
      userEmail: userEmail,
    };
    memoryTeamMembers.push(newMember);
    return newMember;
  }
};

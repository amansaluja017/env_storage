import 'dotenv/config';
import { pgDb, pgPool, users, workspaces, teams, teamMembers } from '@tubo/db';
import bcrypt from 'bcryptjs';

export async function seedInitialData() {
  try {
    console.log('🌱 Verifying PostgreSQL initialization for Auth, Workspaces & Teams...');
    const demoPasswordHash = await bcrypt.hash('password123', 10);

    try {
      // 1. Seed users:
      // Alex Vance (Backend Core)
      // Sarah Jenkins & Marcus Chen (Same team: Backend Core)
      // Elena Rostova (Another team: Mobile & Web Apps)
      const usersToSeed = [
        { id: 'user_demo_123', email: 'alex@tubo.dev', name: 'Alex Vance' },
        { id: 'user_sarah_456', email: 'sarah@tubo.dev', name: 'Sarah Jenkins' },
        { id: 'user_marcus_789', email: 'marcus@tubo.dev', name: 'Marcus Chen' },
        { id: 'user_elena_321', email: 'elena@tubo.dev', name: 'Elena Rostova' },
      ];

      for (const u of usersToSeed) {
        await pgDb.insert(users).values({
          id: u.id,
          email: u.email,
          name: u.name,
          passwordHash: demoPasswordHash,
        }).onConflictDoNothing();
      }

      // 2. Seed primary workspace
      await pgDb.insert(workspaces).values({
        id: 'ws_demo_main',
        name: 'Acme Corp Production',
        slug: 'acme-corp',
        ownerId: 'user_demo_123',
      }).onConflictDoNothing();

      // 3. Seed teams:
      // Primary team: Backend Core
      await pgDb.insert(teams).values({
        id: 'team_backend',
        workspaceId: 'ws_demo_main',
        name: 'Backend Core',
        description: 'API, Microservices & Database infra envs',
      }).onConflictDoNothing();

      // Another team: Mobile & Web Apps
      await pgDb.insert(teams).values({
        id: 'team_frontend',
        workspaceId: 'ws_demo_main',
        name: 'Mobile & Web Apps',
        description: 'Expo Apps & Web dashboard envs',
      }).onConflictDoNothing();

      // 4. Seed team membership relations
      const membersToSeed = [
        // Same team: team_backend (Alex, Sarah, Marcus)
        { id: 'tm_1', teamId: 'team_backend', userId: 'user_demo_123', role: 'owner' as const },
        { id: 'tm_2', teamId: 'team_backend', userId: 'user_sarah_456', role: 'admin' as const },
        { id: 'tm_3', teamId: 'team_backend', userId: 'user_marcus_789', role: 'member' as const },
        // Another team: team_frontend (Elena)
        { id: 'tm_4', teamId: 'team_frontend', userId: 'user_elena_321', role: 'admin' as const },
      ];

      for (const tm of membersToSeed) {
        await pgDb.insert(teamMembers).values(tm).onConflictDoNothing();
      }

      console.log('✅ PostgreSQL seeded with users, workspaces, and team memberships.');
    } catch (dbErr) {
      console.error('❌ Error during PostgreSQL seeding:', dbErr);
    }
  } catch (err) {
    console.error('Error seeding initial data:', err);
  }
}

// Execute seeding if called directly via script
if (process.argv[1]?.includes('seed')) {
  seedInitialData().finally(async () => {
    await pgPool.end();
    process.exit(0);
  });
}

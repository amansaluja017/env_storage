import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgDb, pgPool, users, workspaces, teams, teamMembers, eq } from '@tubo/db';
import bcrypt from 'bcryptjs';

export async function seedInitialData() {
  if (process.env.NODE_ENV === 'production') {
    console.log('Skipping demo accounts seeding in production environment.');
    return;
  }

  try {
    console.log('🌱 Verifying PostgreSQL initialization for Auth, Workspaces & Teams...');
    const demoPasswordHash = await bcrypt.hash('password123', 10);

    try {
      // 1. Seed users:
      // Alex Vance (Backend Core)
      // Sarah Jenkins & Marcus Chen (Same team: Backend Core)
      // Elena Rostova (Another team: Mobile & Web Apps)
      const ALEX_ID = 'a0000000-0000-4000-8000-000000000001';
      const SARAH_ID = 'a0000000-0000-4000-8000-000000000002';
      const MARCUS_ID = 'a0000000-0000-4000-8000-000000000003';
      const ELENA_ID = 'a0000000-0000-4000-8000-000000000004';

      const WORKSPACE_MAIN_ID = 'b0000000-0000-4000-8000-000000000001';
      const TEAM_BACKEND_ID = 'c0000000-0000-4000-8000-000000000001';
      const TEAM_FRONTEND_ID = 'c0000000-0000-4000-8000-000000000002';

      const usersToSeed = [
        { id: ALEX_ID, email: 'alex@tubo.dev', name: 'Alex Vance' },
        { id: SARAH_ID, email: 'sarah@tubo.dev', name: 'Sarah Jenkins' },
        { id: MARCUS_ID, email: 'marcus@tubo.dev', name: 'Marcus Chen' },
        { id: ELENA_ID, email: 'elena@tubo.dev', name: 'Elena Rostova' },
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
        id: WORKSPACE_MAIN_ID,
        name: 'Acme Corp Production',
        slug: 'acme-corp',
        ownerId: ALEX_ID,
      }).onConflictDoNothing();

      // 3. Seed teams:
      // Primary team: Backend Core
      await pgDb.insert(teams).values({
        id: TEAM_BACKEND_ID,
        workspaceId: WORKSPACE_MAIN_ID,
        name: 'Backend Core',
        description: 'API, Microservices & Database infra envs',
      }).onConflictDoNothing();

      // Another team: Mobile & Web Apps
      await pgDb.insert(teams).values({
        id: TEAM_FRONTEND_ID,
        workspaceId: WORKSPACE_MAIN_ID,
        name: 'Mobile & Web Apps',
        description: 'Expo Apps & Web dashboard envs',
      }).onConflictDoNothing();

      // 4. Seed team membership relations
      const membersToSeed = [
        // Same team: team_backend (Alex, Sarah, Marcus)
        { id: 'd0000000-0000-4000-8000-000000000001', teamId: TEAM_BACKEND_ID, userId: ALEX_ID, role: 'admin' as const },
        { id: 'd0000000-0000-4000-8000-000000000002', teamId: TEAM_BACKEND_ID, userId: SARAH_ID, role: 'admin' as const },
        { id: 'd0000000-0000-4000-8000-000000000003', teamId: TEAM_BACKEND_ID, userId: MARCUS_ID, role: 'member' as const },
        // Another team: team_frontend (Elena)
        { id: 'd0000000-0000-4000-8000-000000000004', teamId: TEAM_FRONTEND_ID, userId: ELENA_ID, role: 'admin' as const },
      ];

      for (const tm of membersToSeed) {
        await pgDb.insert(teamMembers).values(tm).onConflictDoNothing();
      }

      console.log('✅ PostgreSQL seeded with users, workspaces, and team memberships.');
    } catch (dbErr) {
      console.error('❌ Error during PostgreSQL seeding:', dbErr);
      throw dbErr;
    }
  } catch (err) {
    console.error('Error seeding initial data:', err);
    throw err;
  }
}

// Execute seeding if called directly via script
const currentFile = typeof __filename !== 'undefined' ? __filename : '';
const isDirectRun =
  Boolean(process.argv[1]) &&
  (currentFile
    ? path.resolve(process.argv[1]) === path.resolve(currentFile)
    : process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'));

if (isDirectRun) {
  seedInitialData()
    .then(async () => {
      await pgPool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Fatal seed failure:', err);
      await pgPool.end();
      process.exit(1);
    });
}

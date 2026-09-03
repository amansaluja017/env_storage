import { pgDb, users, workspaces, teams } from '@tubo/db';
import bcrypt from 'bcryptjs';

export async function seedInitialData() {
  try {
    console.log('🌱 Verifying PostgreSQL initialization for Auth, Workspaces & Teams...');
    const demoPasswordHash = await bcrypt.hash('password123', 10);
    
    // Seed default demo user into PostgreSQL if not present
    try {
      await pgDb.insert(users).values({
        id: 'user_demo_123',
        email: 'alex@tubo.dev',
        name: 'Alex Vance',
        passwordHash: demoPasswordHash,
      }).onConflictDoNothing();

      await pgDb.insert(workspaces).values({
        id: 'ws_demo_main',
        name: 'Acme Corp Production',
        slug: 'acme-corp',
        ownerId: 'user_demo_123',
      }).onConflictDoNothing();

      await pgDb.insert(teams).values({
        id: 'team_backend',
        workspaceId: 'ws_demo_main',
        name: 'Backend Core',
        description: 'API, Microservices & Database infra envs',
      }).onConflictDoNothing();

      console.log('✅ PostgreSQL seeded with initial demo user, workspace, and team.');
    } catch (dbErr) {
      console.log('ℹ️ Postgres connection active or using in-memory fallbacks.');
    }
  } catch (err) {
    console.error('Error seeding initial data:', err);
  }
}


import { sqliteDb, envs } from '@tubo/db';

export function seedInitialData() {
  try {
    const existing = sqliteDb.select().from(envs).all();
    if (existing.length === 0) {
      console.log('🌱 Seeding initial demo ENVs into SQLite database...');

      const defaultEnvs = [
        {
          id: 'env_101',
          workspaceId: 'ws_demo_main',
          teamId: 'team_backend',
          environment: 'development' as const,
          key: 'DATABASE_URL',
          value: 'postgresql://postgres:secret@localhost:5432/tubo_dev',
          isSecret: true,
          comment: 'Postgres primary database connection string',
          createdBy: 'Alex Vance',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'env_102',
          workspaceId: 'ws_demo_main',
          teamId: 'team_backend',
          environment: 'development' as const,
          key: 'REDIS_CACHE_URL',
          value: 'redis://default:auth_token_99@127.0.0.1:6379',
          isSecret: true,
          comment: 'Session and cache store',
          createdBy: 'Alex Vance',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'env_103',
          workspaceId: 'ws_demo_main',
          teamId: 'team_backend',
          environment: 'development' as const,
          key: 'API_PORT',
          value: '4000',
          isSecret: false,
          comment: 'Backend port number',
          createdBy: 'Alex Vance',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'env_104',
          workspaceId: 'ws_demo_main',
          teamId: 'team_backend',
          environment: 'production' as const,
          key: 'STRIPE_SECRET_KEY',
          value: 'sk_live_51M0x9234857109283749281',
          isSecret: true,
          comment: 'Stripe live production gateway key',
          createdBy: 'Alex Vance',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'env_105',
          workspaceId: 'ws_demo_main',
          teamId: 'team_frontend',
          environment: 'development' as const,
          key: 'EXPO_PUBLIC_API_URL',
          value: 'http://10.0.2.2:4000/trpc',
          isSecret: false,
          comment: 'Expo mobile server endpoint',
          createdBy: 'Alex Vance',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      for (const item of defaultEnvs) {
        sqliteDb.insert(envs).values(item).run();
      }

      console.log('✅ Seeded 5 initial environment variables into SQLite.');
    }
  } catch (err) {
    console.error('Error seeding initial data:', err);
  }
}

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const envs = sqliteTable('envs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  teamId: text('team_id').notNull(),
  environment: text('environment').$type<'development' | 'staging' | 'production'>().default('development').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  isSecret: integer('is_secret', { mode: 'boolean' }).default(true).notNull(),
  comment: text('comment'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

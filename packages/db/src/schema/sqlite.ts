import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  teamId: text('team_id').notNull(),
  environment: text('environment').$type<'development' | 'staging' | 'production'>().default('development').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: text('created_by').default('Unknown').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const envs = sqliteTable('envs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  teamId: text('team_id').notNull(),
  environment: text('environment').$type<'development' | 'staging' | 'production'>().default('development').notNull(),
  folderId: text('folder_id'),
  key: text('key').notNull(),
  value: text('value').notNull(),
  isSecret: integer('is_secret', { mode: 'boolean' }).default(true).notNull(),
  comment: text('comment'),
  createdBy: text('created_by').default('Unknown').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

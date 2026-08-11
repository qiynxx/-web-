import { pgTable, text, bigint, uniqueIndex } from 'drizzle-orm/pg-core';

export const feishuOAuthToken = pgTable('feishu_oauth_tokens', {
  userId: text('user_id').primaryKey(),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
  accessExpiresAt: bigint('access_expires_at', { mode: 'number' }).notNull(),
  refreshExpiresAt: bigint('refresh_expires_at', { mode: 'number' }).notNull(),
  scope: text('scope').notNull().default(''),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const projectWorkspace = pgTable(
  'project_workspaces',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    normalizedName: text('normalized_name').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('planned'),
    creatorUserId: text('creator_user_id').notNull(),
    baseToken: text('base_token'),
    nodeTableId: text('node_table_id'),
    edgeTableId: text('edge_table_id'),
    baseUrl: text('base_url'),
    provisioningStatus: text('provisioning_status').notNull().default('creating'),
    provisioningError: text('provisioning_error'),
    catalogRecordId: text('catalog_record_id'),
    catalogSyncStatus: text('catalog_sync_status').notNull().default('pending'),
    deletionStatus: text('deletion_status').notNull().default('active'),
    deletionError: text('deletion_error'),
    deletedAt: bigint('deleted_at', { mode: 'number' }),
    schemaVersion: bigint('schema_version', { mode: 'number' }).notNull().default(1),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    uniqueIndex('project_workspaces_normalized_name_uidx').on(
      table.normalizedName,
    ),
    uniqueIndex('project_workspaces_base_token_uidx').on(table.baseToken),
  ],
);

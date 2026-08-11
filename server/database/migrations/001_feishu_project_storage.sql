CREATE TABLE IF NOT EXISTS feishu_oauth_tokens (
  user_id text PRIMARY KEY,
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  access_expires_at bigint NOT NULL,
  refresh_expires_at bigint NOT NULL,
  scope text NOT NULL DEFAULT '',
  updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS project_workspaces (
  id text PRIMARY KEY,
  code text NOT NULL,
  normalized_name text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned',
  creator_user_id text NOT NULL,
  base_token text,
  node_table_id text,
  edge_table_id text,
  base_url text,
  provisioning_status text NOT NULL DEFAULT 'creating',
  provisioning_error text,
  catalog_record_id text,
  catalog_sync_status text NOT NULL DEFAULT 'pending',
  schema_version bigint NOT NULL DEFAULT 1,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS project_workspaces_normalized_name_uidx
  ON project_workspaces (normalized_name);
CREATE UNIQUE INDEX IF NOT EXISTS project_workspaces_base_token_uidx
  ON project_workspaces (base_token)
  WHERE base_token IS NOT NULL;

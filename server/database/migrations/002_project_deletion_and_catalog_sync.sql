ALTER TABLE project_workspaces
  ADD COLUMN IF NOT EXISTS deletion_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deletion_error text,
  ADD COLUMN IF NOT EXISTS deleted_at bigint;

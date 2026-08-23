ALTER TABLE project_workspaces
ADD COLUMN IF NOT EXISTS deadline TEXT;

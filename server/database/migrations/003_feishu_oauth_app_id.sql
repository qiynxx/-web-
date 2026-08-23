ALTER TABLE feishu_oauth_tokens
  ADD COLUMN IF NOT EXISTS app_id text;

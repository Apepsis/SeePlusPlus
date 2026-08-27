CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  display_name text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  code text NOT NULL CHECK (octet_length(code) <= 1048576),
  language_mode text NOT NULL DEFAULT 'cpp20' CHECK (language_mode IN ('cpp17','cpp20')),
  visibility text NOT NULL CHECK (visibility IN ('private','unlisted','public')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE runs (
  id uuid PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  cache_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','complete','failed')),
  terminal_kind text,
  compiler_ms integer,
  execute_ms integer,
  normalize_ms integer,
  step_count integer,
  trace_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX runs_cache_key_idx ON runs(cache_key);
CREATE INDEX runs_user_created_idx ON runs(user_id, created_at DESC);

CREATE TABLE trace_objects (
  run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  object_key text UNIQUE NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  schema_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE findings (
  id text PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL,
  first_step integer NOT NULL,
  summary text NOT NULL
);

CREATE TABLE examples (
  slug text PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL,
  code text NOT NULL,
  expected_features jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

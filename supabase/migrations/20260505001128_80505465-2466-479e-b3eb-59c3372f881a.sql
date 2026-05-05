CREATE TABLE public.oauth_states (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- No policies: only service role (edge functions) can access.

CREATE INDEX idx_oauth_states_expires ON public.oauth_states(expires_at);

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS lock_salt TEXT;
-- Device tracking table
CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_name text NOT NULL DEFAULT '',
  browser text NOT NULL DEFAULT '',
  os text NOT NULL DEFAULT '',
  ip_address text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT false,
  device_fingerprint text NOT NULL DEFAULT ''
);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own devices" ON public.user_devices
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own devices" ON public.user_devices
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own devices" ON public.user_devices
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices" ON public.user_devices
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Biometric credentials table (stores WebAuthn credential IDs for local biometric unlock)
CREATE TABLE public.biometric_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL,
  credential_label text NOT NULL DEFAULT 'Biometria',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, credential_id)
);

ALTER TABLE public.biometric_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own biometric credentials" ON public.biometric_credentials
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own biometric credentials" ON public.biometric_credentials
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own biometric credentials" ON public.biometric_credentials
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
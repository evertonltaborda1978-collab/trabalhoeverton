
-- Add label column to user_devices
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS custom_label TEXT;

-- device_locations
CREATE TABLE public.device_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id UUID NOT NULL REFERENCES public.user_devices(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  address TEXT,
  battery_level INTEGER,
  is_online BOOLEAN DEFAULT TRUE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'auto'
);
CREATE INDEX idx_device_locations_user_device ON public.device_locations(user_id, device_id, recorded_at DESC);
ALTER TABLE public.device_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own locations" ON public.device_locations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- device_commands
CREATE TABLE public.device_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id UUID NOT NULL REFERENCES public.user_devices(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ
);
CREATE INDEX idx_device_commands_device ON public.device_commands(device_id, status, created_at DESC);
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own commands" ON public.device_commands
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- location_shares (public-readable by token)
CREATE TABLE public.location_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id UUID REFERENCES public.user_devices(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_location_shares_token ON public.location_shares(token);
ALTER TABLE public.location_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages own shares" ON public.location_shares
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public read active shares by token" ON public.location_shares
  FOR SELECT TO anon, authenticated
  USING (is_active = TRUE AND (expires_at IS NULL OR expires_at > now()));

-- geofence_reminders
CREATE TABLE public.geofence_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_m INTEGER NOT NULL DEFAULT 200,
  triggered_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_geofence_user ON public.geofence_reminders(user_id, is_active);
ALTER TABLE public.geofence_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own geofences" ON public.geofence_reminders
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_commands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_locations;

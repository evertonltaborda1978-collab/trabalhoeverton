
-- 1) location_shares: remove broad public SELECT and replace with secure RPC requiring exact token
DROP POLICY IF EXISTS "Public read active shares by token" ON public.location_shares;

CREATE OR REPLACE FUNCTION public.get_shared_location(_token text)
RETURNS TABLE (
  share_id uuid,
  device_id uuid,
  expires_at timestamptz,
  latitude double precision,
  longitude double precision,
  address text,
  recorded_at timestamptz,
  battery_level integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.device_id, s.expires_at,
         l.latitude, l.longitude, l.address, l.recorded_at, l.battery_level
  FROM public.location_shares s
  LEFT JOIN LATERAL (
    SELECT latitude, longitude, address, recorded_at, battery_level
    FROM public.device_locations
    WHERE device_id = s.device_id
    ORDER BY recorded_at DESC
    LIMIT 1
  ) l ON true
  WHERE s.token = _token
    AND s.is_active = true
    AND (s.expires_at IS NULL OR s.expires_at > now())
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_location(text) TO anon, authenticated;

-- 2) oauth_states: explicit owner-only policies (service role bypasses RLS for edge function)
CREATE POLICY "Users manage own oauth states"
ON public.oauth_states
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3) Realtime: restrict channel subscriptions to topics scoped to the user's own auth.uid()
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only subscribe to own topics" ON realtime.messages;
CREATE POLICY "Users can only subscribe to own topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE (auth.uid()::text || ':%')
  OR realtime.topic() LIKE ('user:' || auth.uid()::text || '%')
);

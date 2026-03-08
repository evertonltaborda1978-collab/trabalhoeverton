-- Drop the ALL policies we just created (they're wrongly RESTRICTIVE)
DROP POLICY IF EXISTS "Users can access own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can access own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can access own biometric credentials" ON public.biometric_credentials;
DROP POLICY IF EXISTS "Users can access own devices" ON public.user_devices;
DROP POLICY IF EXISTS "Users can access own google tokens" ON public.google_calendar_tokens;

-- Recreate as PERMISSIVE
CREATE POLICY "Authenticated users access own appointments" ON public.appointments AS PERMISSIVE FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users access own notes" ON public.notes AS PERMISSIVE FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users access own biometric credentials" ON public.biometric_credentials AS PERMISSIVE FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users access own devices" ON public.user_devices AS PERMISSIVE FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users access own google tokens" ON public.google_calendar_tokens AS PERMISSIVE FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_devices_user_fingerprint_unique
ON public.user_devices (user_id, device_fingerprint);
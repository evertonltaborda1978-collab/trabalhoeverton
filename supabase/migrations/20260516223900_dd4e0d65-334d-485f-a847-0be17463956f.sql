ALTER TABLE public.user_devices
ADD COLUMN IF NOT EXISTS manual_address text,
ADD COLUMN IF NOT EXISTS manual_address_updated_at timestamp with time zone;
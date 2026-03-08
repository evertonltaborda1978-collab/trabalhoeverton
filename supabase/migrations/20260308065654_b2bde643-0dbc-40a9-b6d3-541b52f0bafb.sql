
ALTER TABLE public.notes 
ADD COLUMN IF NOT EXISTS reminder_date date,
ADD COLUMN IF NOT EXISTS reminder_time text,
ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS lock_pin text;

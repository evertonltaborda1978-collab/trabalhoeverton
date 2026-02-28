ALTER TABLE public.notes 
ADD COLUMN font_family text NOT NULL DEFAULT 'default',
ADD COLUMN font_size text NOT NULL DEFAULT 'medium';
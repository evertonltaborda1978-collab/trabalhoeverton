ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS pin_order integer;

CREATE INDEX IF NOT EXISTS notes_user_pinned_order_idx
ON public.notes (user_id, is_pinned DESC, pin_order ASC)
WHERE deleted_at IS NULL;
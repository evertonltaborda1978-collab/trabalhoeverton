CREATE OR REPLACE FUNCTION public.update_notes_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['is_pinned', 'pin_order', 'sincronizado', 'updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['is_pinned', 'pin_order', 'sincronizado', 'updated_at']) THEN
    NEW.updated_at = now();
  ELSE
    NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_notes_updated_at ON public.notes;
CREATE TRIGGER update_notes_updated_at
BEFORE UPDATE ON public.notes
FOR EACH ROW EXECUTE FUNCTION public.update_notes_updated_at_column();

REVOKE EXECUTE ON FUNCTION public.update_notes_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_notes_updated_at_column() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_notes_updated_at_column() FROM authenticated;
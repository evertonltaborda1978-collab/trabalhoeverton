REVOKE EXECUTE ON FUNCTION public.get_shared_location(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_location(text) TO service_role;
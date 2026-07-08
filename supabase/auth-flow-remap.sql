-- ============================================================
-- Royal Success - Authentication Flow Remap
--
-- Adds:
--  1. Phone-number capture from Supabase Auth metadata into profiles.
--  2. A small RPC used by the login screen to detect missing email accounts.
--
-- Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone_number, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NULLIF(NEW.raw_user_meta_data->>'phone_number', ''),
    'pending'
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION public.auth_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE lower(u.email) = lower(trim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.auth_email_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_email_exists(text) TO anon, authenticated;

COMMENT ON FUNCTION public.auth_email_exists(text) IS
  'Returns true when an email exists in auth.users. Used by the login screen to show the create-account path for missing accounts.';

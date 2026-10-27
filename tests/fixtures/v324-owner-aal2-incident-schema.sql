-- V324 ephemeral-only JWT/owner fixture. Real Supabase Auth functions are
-- NOT replaced in production, and these never represent real customer JWTs.
CREATE TABLE public.owner_users(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  role text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims',true),'')::jsonb,
    '{}'::jsonb
  )
$$;

INSERT INTO auth.users(id)
VALUES
('10000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002'),
('10000000-0000-4000-8000-000000000003');
INSERT INTO public.owner_users(user_id,role,active)
VALUES
('10000000-0000-4000-8000-000000000001','owner',true),
('10000000-0000-4000-8000-000000000002','owner',false),
('10000000-0000-4000-8000-000000000003','member',true);
-- User 1 mirrors a single production owner; user 2 is a *synthetic*
-- potential second reviewer, initially inactive.

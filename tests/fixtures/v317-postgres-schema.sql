-- V317 ephemeral PostgreSQL fixture. NEVER run against an existing database.
-- This file creates minimal production-shaped objects only in an empty CI
-- postgres:17 service; it intentionally omits all customer data.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.plans(
  id text PRIMARY KEY,
  price_monthly_usd numeric NOT NULL,
  is_active boolean NOT NULL
);
CREATE TABLE public.billing_plan_mappings(
  provider text NOT NULL,
  plan_id text NOT NULL REFERENCES public.plans(id),
  provider_plan_id text,
  currency text NOT NULL,
  recurring boolean NOT NULL,
  is_active boolean NOT NULL,
  PRIMARY KEY(provider,plan_id)
);
CREATE TABLE public.checkout_intents(
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  plan_id text NOT NULL REFERENCES public.plans(id),
  provider text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL,
  status text NOT NULL CHECK(status IN ('created','pending','paid','failed','expired','canceled')),
  provider_reference text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payment_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_key text NOT NULL,
  event_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  plan_id text REFERENCES public.plans(id),
  amount numeric,
  currency text,
  status text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_event_key)
);
CREATE UNIQUE INDEX payment_events_flutterwave_transaction_unique
 ON public.payment_events(provider,(raw_payload->>'transaction_id'))
 WHERE provider='flutterwave' AND (raw_payload->>'transaction_id') IS NOT NULL;
CREATE TABLE public.subscriptions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) UNIQUE,
  plan_id text NOT NULL REFERENCES public.plans(id),
  status text NOT NULL,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscriptions_provider_customer_unique
 ON public.subscriptions(provider,provider_customer_id)
 WHERE provider IS NOT NULL AND provider_customer_id IS NOT NULL;
CREATE UNIQUE INDEX subscriptions_provider_subscription_unique
 ON public.subscriptions(provider,provider_subscription_id)
 WHERE provider IS NOT NULL AND provider_subscription_id IS NOT NULL;
INSERT INTO auth.users VALUES ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
INSERT INTO public.plans VALUES ('pro',19,true),('executive',49,true),('inactive',10,false);
INSERT INTO public.billing_plan_mappings VALUES
 ('flutterwave','pro','101','USD',true,true),
 ('flutterwave','executive','102','USD',true,true),
 ('flutterwave','inactive','103','USD',true,true);

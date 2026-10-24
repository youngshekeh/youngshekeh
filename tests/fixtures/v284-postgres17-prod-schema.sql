-- V284 disposable PostgreSQL 17 replica, based on 2026-10-24 READ-ONLY
-- live information_schema, actual CHECK / UNIQUE indexes and active plan prices.
-- This is not a production dump; EVERY user is synthetic, no provider secrets.
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users(id)
 SELECT format('00000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid
 FROM generate_series(1,200) AS n;
CREATE TABLE public.plans(
 id text PRIMARY KEY,
 name text NOT NULL DEFAULT '',
 price_monthly_usd numeric NOT NULL CHECK(price_monthly_usd>=0),
 features jsonb NOT NULL DEFAULT '{}'::jsonb,
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.billing_plan_mappings(
 provider text NOT NULL,
 plan_id text NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
 provider_plan_id text,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 recurring boolean NOT NULL,
 is_active boolean NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,plan_id)
);
CREATE UNIQUE INDEX billing_plan_mappings_provider_plan_unique
 ON public.billing_plan_mappings(provider,provider_plan_id)
 WHERE provider_plan_id IS NOT NULL;
CREATE TABLE public.checkout_intents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 plan_id text NOT NULL REFERENCES public.plans(id),
 provider text NOT NULL,
 amount numeric NOT NULL CHECK(amount>0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'created'
   CHECK(status IN ('created','pending','paid','failed','expired','canceled')),
 provider_reference text,
 checkout_url text,
 expires_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX checkout_intents_provider_reference_key
 ON public.checkout_intents(provider,provider_reference)
 WHERE provider_reference IS NOT NULL;
CREATE UNIQUE INDEX checkout_intents_one_open_per_user_plan_provider
 ON public.checkout_intents(user_id,plan_id,provider)
 WHERE status IN ('created','pending');
CREATE TABLE public.payment_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL,
 provider_event_key text NOT NULL,
 event_type text NOT NULL,
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 plan_id text REFERENCES public.plans(id),
 amount numeric CHECK (amount IS NULL OR amount>=0),
 currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 status text,
 raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_event_key)
);
CREATE UNIQUE INDEX payment_events_flutterwave_transaction_unique
 ON public.payment_events(provider,((raw_payload->>'transaction_id')))
 WHERE provider='flutterwave' AND (raw_payload->>'transaction_id') IS NOT NULL;
CREATE TABLE public.subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
 plan_id text NOT NULL REFERENCES public.plans(id),
 status text NOT NULL CHECK(status IN ('inactive','trialing','active','past_due','canceled')),
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
INSERT INTO public.plans(id,name,price_monthly_usd,is_active) VALUES
 ('pro','Pro',79,true),('executive','Executive',499,true),
 ('business','Business',1500,true),('enterprise','Enterprise',5000,true);
INSERT INTO public.billing_plan_mappings(provider,plan_id,provider_plan_id,currency,recurring,is_active)
 VALUES('flutterwave','pro','test-provider-pro','USD',true,true),
 ('flutterwave','executive','test-provider-executive','USD',true,true),
 ('flutterwave','business','test-provider-business','USD',true,true),
 ('flutterwave','enterprise','test-provider-enterprise','USD',true,true);

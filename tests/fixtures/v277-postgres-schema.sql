-- V277: brand-new throwaway GitHub Actions PostgreSQL 16 database ONLY.
-- Minimal faithful payment columns and UNIQUE indexes verified in read-only Supabase.
CREATE ROLE service_role NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.plans(
 id text PRIMARY KEY,
 is_active boolean NOT NULL DEFAULT true,
 price_monthly_usd numeric NOT NULL
);
CREATE TABLE public.billing_plan_mappings(
 plan_id text NOT NULL,
 provider text NOT NULL,
 provider_plan_id text,
 currency text NOT NULL,
 recurring boolean NOT NULL DEFAULT true,
 is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.checkout_intents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 plan_id text NOT NULL REFERENCES public.plans(id),
 provider text NOT NULL,
 provider_reference text,
 status text NOT NULL DEFAULT 'created',
 amount numeric NOT NULL,
 currency text NOT NULL DEFAULT 'USD',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payment_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL,
 provider_event_key text NOT NULL,
 event_type text NOT NULL,
 user_id uuid,
 plan_id text REFERENCES public.plans(id),
 amount numeric,
 currency text,
 status text,
 raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_event_key)
);
CREATE TABLE public.subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL UNIQUE,
 plan_id text NOT NULL REFERENCES public.plans(id),
 status text NOT NULL,
 provider text,
 provider_customer_id text,
 provider_subscription_id text,
 current_period_end timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX checkout_intents_provider_reference_key
 ON public.checkout_intents(provider,provider_reference) WHERE provider_reference IS NOT NULL;
CREATE UNIQUE INDEX checkout_intents_one_open_per_user_plan_provider
 ON public.checkout_intents(user_id,plan_id,provider) WHERE status IN ('created','pending');
CREATE UNIQUE INDEX payment_events_flutterwave_transaction_unique
 ON public.payment_events(provider,((raw_payload->>'transaction_id')))
 WHERE provider='flutterwave' AND (raw_payload->>'transaction_id') IS NOT NULL;
CREATE UNIQUE INDEX subscriptions_provider_customer_unique
 ON public.subscriptions(provider,provider_customer_id)
 WHERE provider IS NOT NULL AND provider_customer_id IS NOT NULL;
CREATE UNIQUE INDEX subscriptions_provider_subscription_unique
 ON public.subscriptions(provider,provider_subscription_id)
 WHERE provider IS NOT NULL AND provider_subscription_id IS NOT NULL;
INSERT INTO public.plans(id,is_active,price_monthly_usd)
 VALUES ('pro',true,29),('executive',true,89),('business',true,249),('enterprise',true,749);
INSERT INTO public.billing_plan_mappings(plan_id,provider,provider_plan_id,currency,recurring,is_active)
 VALUES ('pro','flutterwave','plan-pro','USD',true,true),
        ('executive','flutterwave','plan-exec','USD',true,true);

-- V126 Human Review Inbox audit binding
-- Human review remains append-only, owner-only, MFA/AAL2 gated, and has no capital authority.

alter table public.gold_human_review_events
  add column if not exists reviewer_user_id uuid,
  add column if not exists reviewer_role text,
  add column if not exists classifier_version text,
  add column if not exists review_request_sha256 text,
  add column if not exists decision_context jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.gold_human_review_events'::regclass
      and conname='gold_human_review_events_decision_check'
  ) then
    alter table public.gold_human_review_events
      add constraint gold_human_review_events_decision_check
      check (
        decision is null
        or decision in (
          'EVIDENCE_SUPPORTIVE',
          'EVIDENCE_CONTRADICTORY',
          'EVIDENCE_INCONCLUSIVE',
          'DEFERRED'
        )
      );
  end if;
end $$;

create unique index if not exists gold_human_review_events_evidence_uidx
  on public.gold_human_review_events(evidence_sha256);

create index if not exists gold_human_review_events_classifier_idx
  on public.gold_human_review_events(classifier_version,event_at desc);

create index if not exists gold_human_review_events_reviewer_idx
  on public.gold_human_review_events(reviewer_user_id,event_at desc);

revoke all privileges on table public.gold_human_review_events from public, anon, authenticated;
grant select, insert on table public.gold_human_review_events to service_role;

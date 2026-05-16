-- RINDAY / Finanzas familiares
-- Additive, reversible family model normalization.
--
-- Goal:
-- - Keep public.family_groups as the canonical family table.
-- - Preserve legacy public.families and legacy family_id columns.
-- - Add canonical family_group_id columns where missing.
-- - Backfill only rows with an unambiguous same-UUID mapping.
-- - Add new NOT VALID foreign keys toward public.family_groups(id).
-- - Avoid destructive changes: no DROP, no DELETE, no legacy column removal.

begin;

-- 1) Identity map between legacy families and canonical family_groups.
create table if not exists public.family_identity_map (
  legacy_family_id uuid primary key references public.families(id),
  family_group_id uuid not null references public.family_groups(id),
  migration_note text,
  created_at timestamptz not null default now()
);

comment on table public.family_identity_map is
  'Temporary/additive bridge from legacy families.id to canonical family_groups.id.';

comment on column public.family_identity_map.legacy_family_id is
  'Legacy public.families.id.';

comment on column public.family_identity_map.family_group_id is
  'Canonical public.family_groups.id.';

-- Auto-map only IDs that exist in both tables.
insert into public.family_identity_map (
  legacy_family_id,
  family_group_id,
  migration_note
)
select
  f.id as legacy_family_id,
  fg.id as family_group_id,
  'same uuid auto-map'
from public.families f
join public.family_groups fg on fg.id = f.id
on conflict (legacy_family_id) do nothing;

-- 2) Add canonical columns where they do not exist yet.
alter table public.family_members
  add column if not exists family_group_id uuid;

alter table public.assets
  add column if not exists family_group_id uuid;

alter table public.debts
  add column if not exists family_group_id uuid;

alter table public.cards
  add column if not exists family_group_id uuid;

-- family_goals.family_group_id already exists in current production,
-- but keep this idempotent for reproducible environments.
alter table public.family_goals
  add column if not exists family_group_id uuid;

-- 3) Backfill canonical family_group_id from the identity map.
-- This only touches rows whose legacy family_id has a clear map.
update public.family_members fm
set family_group_id = m.family_group_id
from public.family_identity_map m
where fm.family_id = m.legacy_family_id
  and fm.family_group_id is null;

update public.assets a
set family_group_id = m.family_group_id
from public.family_identity_map m
where a.family_id = m.legacy_family_id
  and a.family_group_id is null;

update public.debts d
set family_group_id = m.family_group_id
from public.family_identity_map m
where d.family_id = m.legacy_family_id
  and d.family_group_id is null;

update public.cards c
set family_group_id = m.family_group_id
from public.family_identity_map m
where c.family_id = m.legacy_family_id
  and c.family_group_id is null;

-- Backfill only goals with a non-null family_id that maps clearly.
-- Rows with both family_id and family_group_id null, such as "CASA 1",
-- are intentionally left untouched for manual classification.
update public.family_goals fg
set family_group_id = m.family_group_id
from public.family_identity_map m
where fg.family_id = m.legacy_family_id
  and fg.family_group_id is null;

-- 4) Add NOT VALID foreign keys toward canonical family_groups.
-- NOT VALID avoids a heavy immediate validation and keeps this migration
-- additive. Validate in a later migration after QA confirms backfill.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'family_members_family_group_id_fkey'
      and conrelid = 'public.family_members'::regclass
  ) then
    alter table public.family_members
      add constraint family_members_family_group_id_fkey
      foreign key (family_group_id)
      references public.family_groups(id)
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assets_family_group_id_fkey'
      and conrelid = 'public.assets'::regclass
  ) then
    alter table public.assets
      add constraint assets_family_group_id_fkey
      foreign key (family_group_id)
      references public.family_groups(id)
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'debts_family_group_id_fkey'
      and conrelid = 'public.debts'::regclass
  ) then
    alter table public.debts
      add constraint debts_family_group_id_fkey
      foreign key (family_group_id)
      references public.family_groups(id)
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cards_family_group_id_fkey'
      and conrelid = 'public.cards'::regclass
  ) then
    alter table public.cards
      add constraint cards_family_group_id_fkey
      foreign key (family_group_id)
      references public.family_groups(id)
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'family_goals_family_group_id_fkey'
      and conrelid = 'public.family_goals'::regclass
  ) then
    alter table public.family_goals
      add constraint family_goals_family_group_id_fkey
      foreign key (family_group_id)
      references public.family_groups(id)
      not valid;
  end if;
end $$;

-- 5) Safe supporting indexes.
create index if not exists idx_family_identity_map_family_group_id
  on public.family_identity_map (family_group_id);

create index if not exists idx_family_members_family_group_id
  on public.family_members (family_group_id);

create index if not exists idx_family_members_family_group_status
  on public.family_members (family_group_id, status);

create index if not exists idx_assets_family_group_id
  on public.assets (family_group_id);

create index if not exists idx_debts_family_group_id
  on public.debts (family_group_id);

create index if not exists idx_cards_family_group_id
  on public.cards (family_group_id);

create index if not exists idx_family_goals_family_group_id
  on public.family_goals (family_group_id);

create index if not exists idx_transactions_family_group_date
  on public.transactions (family_group_id, date);

create index if not exists idx_family_invites_family_status
  on public.family_invites (family_id, status);

commit;

alter table public.family_members enable row level security;

create or replace function public.is_family_member(_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_groups fg
    where fg.id = _family_id
      and fg.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.family_members fm
    where fm.family_id = _family_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

create or replace function public.is_family_admin(_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_groups fg
    where fg.id = _family_id
      and fg.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.family_members fm
    where fm.family_id = _family_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
      and fm.role in ('owner', 'admin')
  );
$$;

grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_family_admin(uuid) to authenticated;

drop policy if exists family_members_select_same_family_v1 on public.family_members;

create policy family_members_select_same_family_v1
on public.family_members
for select
to authenticated
using (public.is_family_member(family_id));

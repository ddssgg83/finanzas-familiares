alter table public.family_groups enable row level security;

drop policy if exists family_groups_select_same_family_v1 on public.family_groups;

create policy family_groups_select_same_family_v1
on public.family_groups
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_family_member(id)
);

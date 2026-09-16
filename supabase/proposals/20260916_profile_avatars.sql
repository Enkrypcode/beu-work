-- PROPOSAL ONLY. Do not apply until the current production schema and storage
-- policies have been reviewed. This is additive and preserves existing RLS.
begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_path'
  ) then
    raise exception 'profiles.avatar_path already exists; review the deployed avatar mechanism first';
  end if;
  if exists (select 1 from storage.buckets where id = 'profile-avatars') then
    raise exception 'The profile-avatars bucket already exists; review its deployed policies first';
  end if;
end;
$$;

alter table public.profiles add column avatar_path text;
alter table public.profiles add constraint profiles_avatar_path_check
  check (avatar_path is null or avatar_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar[.]webp$');

-- Private bucket: browser clients receive short-lived signed URLs only after
-- Storage RLS permits access. No public profile-photo URLs are created.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 1048576, array['image/webp']) ;

create policy "BEU avatar reads are limited to the owner or work monitors"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_beu_priority_super_admin()
    or exists (select 1 from public.beu_work_members m where m.user_id = auth.uid())
  )
);

create policy "BEU Super Admin manages profile avatars"
on storage.objects for all to authenticated
using (bucket_id = 'profile-avatars' and public.is_beu_priority_super_admin())
with check (bucket_id = 'profile-avatars' and public.is_beu_priority_super_admin());

-- Preserve the existing runtime Super Admin helper and every task policy.
-- The monitoring response adds only the private Storage object path, never an
-- email, admin flag, note, or task visibility beyond the existing company set.
create or replace function public.beu_work_snapshot()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    public.is_beu_priority_super_admin()
    or exists (select 1 from public.beu_work_members m where m.user_id = auth.uid())
  ) then
    raise exception 'BEU Work monitoring access required' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'tasks', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', t.id, 'user_id', t.user_id, 'title', t.title, 'category', t.category,
      'deadline', t.deadline, 'sort_order', t.sort_order, 'status', t.status,
      'visibility', t.visibility, 'created_at', t.created_at, 'updated_at', t.updated_at,
      'completed_at', t.completed_at
    ) order by t.sort_order, t.id) from public.tasks t where t.visibility = 'company'), '[]'::jsonb),
    'people', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', p.user_id, 'full_name', p.full_name, 'job_title', p.job_title,
      'avatar_path', p.avatar_path
    ) order by p.full_name, p.user_id) from public.profiles p
    where p.user_id = auth.uid()
      or exists (select 1 from public.beu_work_members m where m.user_id = p.user_id)
      or exists (select 1 from public.tasks t where t.user_id = p.user_id and t.visibility = 'company')), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.beu_work_snapshot() from public, anon, authenticated;
grant execute on function public.beu_work_snapshot() to authenticated;

commit;

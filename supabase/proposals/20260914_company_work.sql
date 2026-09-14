-- PROPOSAL ONLY. NOT APPLIED. Requires production-schema review and user approval.
-- Assumes the audited tasks/profiles schema and existing owner-only task RLS.
-- Run preflight.sql first. Do not apply if deployed policies differ without reviewing them.
begin;
do $$ begin
  if not exists (select 1 from pg_class where oid='public.tasks'::regclass and relrowsecurity) then
    raise exception 'Task RLS must already be enabled';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='visibility') then
    raise exception 'Visibility already exists: review and reuse the deployed mechanism instead';
  end if;
end $$;

alter table public.tasks add column visibility text not null default 'private'
  constraint tasks_visibility_check check (visibility in ('private', 'company'));
create index tasks_company_monitoring_idx on public.tasks (status, sort_order, deadline)
  where visibility = 'company';

-- Access list referencing existing identities, not a second user/profile database.
-- No employee is automatically enrolled merely because they signed up to Priority.
create table public.beu_work_members (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.beu_work_members enable row level security;
revoke all on public.beu_work_members from public, anon, authenticated;
-- Super Admin authorization stays dynamic through the existing
-- public.is_beu_priority_super_admin() helper. Do not seed, copy, or replace it.
-- This list is only for specifically approved non-Super-Admin monitors.
-- Additional approved existing employee IDs are enrolled by a database administrator.
-- Browser clients cannot grant themselves membership or edit this access list.

create function public.beu_work_snapshot()
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
      'user_id', p.user_id, 'full_name', p.full_name, 'job_title', p.job_title
    ) order by p.full_name, p.user_id) from public.profiles p
    where exists (select 1 from public.beu_work_members m where m.user_id = p.user_id)
      or exists (select 1 from public.tasks t where t.user_id = p.user_id and t.visibility = 'company')), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.beu_work_snapshot() from public, anon, authenticated;
grant execute on function public.beu_work_snapshot() to authenticated;
-- Do not broaden tasks SELECT or change any owner CRUD policy.
-- No notes, emails, admin flags, private counts, or private tasks are returned.
-- SECURITY DEFINER is necessary to preserve Priority's owner-only SELECT behavior.
commit;

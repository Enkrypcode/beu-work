-- PROPOSAL ONLY. DO NOT APPLY without reviewing it against production first.
-- Adds a presentation preference for the existing profile, with no new identity
-- table and no changes to task, profile, or Storage RLS policies.
begin;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is required';
  end if;
  if to_regprocedure('public.beu_work_snapshot()') is null then
    raise exception 'public.beu_work_snapshot() is required';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'timeline_color'
  ) then
    raise exception 'profiles.timeline_color already exists; review the deployed implementation first';
  end if;
end;
$$;

alter table public.profiles add column timeline_color text;
alter table public.profiles add constraint profiles_timeline_color_check
  check (timeline_color is null or timeline_color ~ '^#[0-9A-Fa-f]{6}$');

-- Requested profile presentation values. These are profile attributes, not
-- browser-side identity rules. The exact-name guard below prevents a partial
-- or silent assignment if production profile data differs from the audit.
with requested_colors(full_name, timeline_color) as (
  values
    ('Gisela Luigi Septiana', '#8ACFF8'),
    ('Advira Yunita S. Yunan', '#FFCED8'),
    ('Riski Nova Sari', '#FCF9EA'),
    ('Kamal Fikri Nabawi', '#22396F')
)
update public.profiles profile
set timeline_color = requested_colors.timeline_color
from requested_colors
where profile.full_name = requested_colors.full_name;

do $$
begin
  if (select count(*) from public.profiles where full_name in (
    'Gisela Luigi Septiana',
    'Advira Yunita S. Yunan',
    'Riski Nova Sari',
    'Kamal Fikri Nabawi'
  ) and timeline_color is not null) <> 4 then
    raise exception 'Expected four named profiles to receive timeline colors; no changes were committed';
  end if;
end;
$$;

-- The existing secure monitoring RPC exposes only the extra presentation
-- value alongside the already-approved profile fields. It still excludes
-- email, admin flags, notes, and non-company tasks.
create or replace function public.beu_work_snapshot()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    public.is_beu_priority_super_admin()
    or exists (select 1 from public.beu_work_members member where member.user_id = auth.uid())
  ) then
    raise exception 'BEU Work monitoring access required' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'tasks', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', task.id, 'user_id', task.user_id, 'title', task.title, 'category', task.category,
      'deadline', task.deadline, 'sort_order', task.sort_order, 'status', task.status,
      'visibility', task.visibility, 'created_at', task.created_at, 'updated_at', task.updated_at,
      'completed_at', task.completed_at
    ) order by task.sort_order, task.id) from public.tasks task where task.visibility = 'company'), '[]'::jsonb),
    'people', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', profile.user_id, 'full_name', profile.full_name, 'job_title', profile.job_title,
      'avatar_path', profile.avatar_path, 'timeline_color', profile.timeline_color
    ) order by profile.full_name, profile.user_id) from public.profiles profile
    where profile.user_id = auth.uid()
      or exists (select 1 from public.beu_work_members member where member.user_id = profile.user_id)
      or exists (select 1 from public.tasks task where task.user_id = profile.user_id and task.visibility = 'company')), '[]'::jsonb)
  );
end;
$$;

commit;

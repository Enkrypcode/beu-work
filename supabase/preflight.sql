-- READ ONLY. Run in the existing Supabase SQL Editor and review before applying proposals.
select table_name, column_name, data_type, column_default, is_nullable
from information_schema.columns where table_schema = 'public'
and table_name in ('tasks', 'profiles') order by table_name, ordinal_position;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('tasks', 'profiles');
select relname, relrowsecurity, relforcerowsecurity from pg_class
where oid in ('public.tasks'::regclass, 'public.profiles'::regclass);
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('tasks', 'profiles');
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid in ('public.tasks'::regclass, 'public.profiles'::regclass);
select p.oid::regprocedure as function_name, p.prosecdef, p.proconfig, p.proacl,
pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('is_beu_priority_super_admin', 'beu_work_snapshot');
-- Check whether the current signup process includes people outside the company.
-- Decide and approve explicit monitoring membership; profile existence alone is not authorization.

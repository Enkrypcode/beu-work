-- READ ONLY. Run one numbered query at a time in the existing Supabase SQL Editor.
-- Paste each result back as JSON. None of these statements changes data or schema.

-- 1. tasks columns
select table_name, column_name, ordinal_position, data_type, udt_name,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'tasks'
order by ordinal_position;

-- 2. profiles columns
select table_name, column_name, ordinal_position, data_type, udt_name,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- 3. RLS enabled and forced flags
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('tasks', 'profiles')
order by c.relname;

-- 4. Current RLS policies
select schemaname, tablename, policyname, permissive, roles, cmd,
       qual as using_expression,
       with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename in ('tasks', 'profiles')
order by tablename, policyname;

-- 5. Table grants
select grantee, table_name, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('tasks', 'profiles')
order by table_name, grantee, privilege_type;

-- 6. Column grants (important for profiles.is_super_admin)
select grantee, table_name, column_name, privilege_type, is_grantable
from information_schema.column_privileges
where table_schema = 'public' and table_name in ('tasks', 'profiles')
order by table_name, column_name, grantee, privilege_type;

-- 7. Primary, foreign-key, check, and unique constraints
select conrelid::regclass::text as table_name,
       conname as constraint_name,
       contype as constraint_type,
       pg_get_constraintdef(oid, true) as definition
from pg_constraint
where conrelid in ('public.tasks'::regclass, 'public.profiles'::regclass)
order by table_name, constraint_name;

-- 8. Indexes (confirms existing task ordering/index conventions)
select tablename as table_name, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('tasks', 'profiles')
order by tablename, indexname;

-- 9. Public schema create privilege (needed to assess the existing helper's search_path context)
select coalesce(grantee.rolname, 'PUBLIC') as grantee,
       privilege.privilege_type,
       grantor.rolname as grantor,
       privilege.is_grantable
from pg_namespace n
cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner)))
  as privilege(grantor_oid, grantee_oid, privilege_type, is_grantable)
left join pg_roles grantee on grantee.oid = privilege.grantee_oid
join pg_roles grantor on grantor.oid = privilege.grantor_oid
where n.nspname = 'public'
order by grantee, privilege.privilege_type;
